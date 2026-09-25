import { createPublicKey, verify } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export const IDP_ORIGIN = process.env.E2E_IDP_ORIGIN || 'http://localhost:5115';
export const AUDIENCE = 'sbqr-fi-gateway';
/** fi-idp-mock seed convention: every demo user's password is `<username>@1234`. */
export const demoPassword = (username: string) => `${username}@1234`;

const EVIDENCE_ROOT = path.resolve(import.meta.dirname, '../e2e-evidence');
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

/**
 * Numbered, full-page screenshot per test step. Written to
 * e2e-evidence/<test>/NN-<step>.png and attached to the HTML report.
 */
export function evidence(page: Page, testInfo: TestInfo) {
  const dir = path.join(EVIDENCE_ROOT, slug(testInfo.titlePath.slice(1).join(' ')));
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (step: string) => {
    const file = path.join(dir, `${String(++n).padStart(2, '0')}-${slug(step)}.png`);
    // Fast-forward finite CSS animations (error shake, dialog fade) so the shot shows the settled state.
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    await testInfo.attach(`${String(n).padStart(2, '0')} ${step}`, { path: file, contentType: 'image/png' });
  };
}

export interface VerifiedJwt {
  header: { alg: string; kid: string; typ?: string };
  payload: Record<string, unknown> & { iss: string; aud: string; sub: string; iat: number; exp: number };
  signatureValid: boolean;
}

/** Verify an RS256 JWT against the IdP's published JWKS — fetched directly from the IdP, not via the emulator. */
export async function verifyWithIdpJwks(token: string): Promise<VerifiedJwt> {
  const [h, p, s] = token.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const jwks = (await (await fetch(`${IDP_ORIGIN}/.well-known/jwks.json`)).json()) as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`kid ${header.kid} not in IdP JWKS`);
  const signatureValid = verify(
    'RSA-SHA256',
    Buffer.from(`${h}.${p}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(s, 'base64url'),
  );
  return { header, payload, signatureValid };
}

/** The emulator keeps the logged-in session (incl. the IdP access token) in sessionStorage. */
export async function readSession(page: Page) {
  const raw = await page.evaluate(() => sessionStorage.getItem('sbqr-emu:session'));
  return raw ? (JSON.parse(raw) as { username: string; tokens: { accessToken: string; refreshToken: string } }) : null;
}
