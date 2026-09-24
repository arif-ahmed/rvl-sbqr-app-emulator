// Account-holder login against the FI Identity Provider.
//
// Dev wiring: the FI IdP used by rvl-sbqr-fi-gateway in development
// (tmp/fakes/fake-idp.js) exposes POST /mint {iss, aud, sub, ...} and returns
// an RS256 JWT that the BFF validates via JWKS. The password is checked by
// the emulator against the demo customer list only — it is never sent.

import { postJson } from './http';

export const IDP_ISSUER = import.meta.env.VITE_IDP_ISSUER || 'http://localhost:5105';
export const IDP_AUDIENCE = import.meta.env.VITE_IDP_AUDIENCE || 'sbqr-fi-gateway';

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
  claims: JwtClaims;
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

export async function signIn(username: string, displayName: string): Promise<Tokens> {
  const { token } = await postJson<{ token: string }>('IdP', '/mint', {
    iss: IDP_ISSUER,
    aud: IDP_AUDIENCE,
    sub: `user-${username}`,
    name: displayName,
    preferred_username: username,
  });
  return { accessToken: token, claims: decodeJwt(token) };
}

/** Treat tokens within 20 s of expiry as expired so calls don't fail on the wire. */
export function isFresh(t: Tokens | null | undefined): boolean {
  const exp = t?.claims.exp;
  return Boolean(exp && exp * 1000 - Date.now() > 20_000);
}
