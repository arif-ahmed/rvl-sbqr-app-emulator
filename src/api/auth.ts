// Account-holder login against the FI Identity Provider.
//
// Same call a native FI app makes: the OAuth2 Resource Owner Password
// Credentials grant on POST /connect/token (form-encoded). The IdP owns the
// credential check and account status (locked / password expired) and returns
// an RS256 access token the BFF validates via JWKS, plus a refresh token that
// rotates on every use.

import { ApiError, postForm } from './http';

export interface JwtClaims {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  [k: string]: unknown;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  claims: JwtClaims;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/** The IdP refused the grant. `code` is the OAuth2 `error`; the message is safe to show the user. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function decodeJwt(token: string): JwtClaims {
  const part = token.split('.')[1];
  if (!part) return {};
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtClaims;
  } catch {
    return {};
  }
}

async function tokenRequest(fields: Record<string, string>): Promise<Tokens> {
  try {
    const r = await postForm<TokenResponse>('IdP', '/connect/token', fields, ['password', 'refresh_token']);
    return { accessToken: r.access_token, refreshToken: r.refresh_token, claims: decodeJwt(r.access_token) };
  } catch (e) {
    const body = e instanceof ApiError ? (e.body as { error?: unknown } | undefined) : undefined;
    if (e instanceof ApiError && e.status === 400 && typeof body?.error === 'string') throw new AuthError(body.error, e.message);
    throw e;
  }
}

export function signIn(username: string, password: string): Promise<Tokens> {
  return tokenRequest({ grant_type: 'password', username, password });
}

/** Exchanges (and thereby invalidates) the refresh token for a fresh pair. */
export function refresh(refreshToken: string): Promise<Tokens> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Treat tokens within 20 s of expiry as expired so calls don't fail on the wire. */
export function isFresh(t: Tokens | null | undefined): boolean {
  const exp = t?.claims.exp;
  return Boolean(exp && exp * 1000 - Date.now() > 20_000);
}
