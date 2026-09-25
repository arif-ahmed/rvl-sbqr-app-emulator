import { expect, test, type APIRequestContext } from '@playwright/test';
import { AUDIENCE, IDP_ORIGIN, demoPassword, evidence, readSession, verifyWithIdpJwks } from './support';

// The real OAuth2 password grant (POST /connect/token) of fi-idp-mock, called
// through the emulator's /idp proxy — the contract the emulator's login relies on.

const passwordGrant = (request: APIRequestContext, username: string, password: string) =>
  request.post('/idp/connect/token', { form: { grant_type: 'password', username, password } });

test.describe('fi-idp-mock /connect/token via emulator proxy', () => {
  test('valid credentials return RS256 access, id and refresh tokens', async ({ request }, testInfo) => {
    const res = await passwordGrant(request, 'fatema', 'fatema@1234');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 300 });
    expect(body.refresh_token).toBeTruthy();

    const jwt = await verifyWithIdpJwks(body.access_token);
    await testInfo.attach('connect-token-access-token.json', { body: JSON.stringify(jwt, null, 2), contentType: 'application/json' });
    expect(jwt.signatureValid).toBe(true);
    expect(jwt.payload).toMatchObject({
      iss: IDP_ORIGIN,
      aud: AUDIENCE,
      sub: 'user-fatema',
      customer_id: 'CIF-00458821',
      fi_id: 'dhakabank',
    });
  });

  for (const [username, password, error] of [
    ['fatema', 'wrong', 'invalid_grant'],
    ['ghost', 'ghost@1234', 'invalid_grant'],
    ['nasrin', 'nasrin@1234', 'account_locked'],
    ['jalal', 'jalal@1234', 'password_expired'],
  ] as const) {
    test(`${username}/${password} → 400 ${error}`, async ({ request }, testInfo) => {
      const res = await passwordGrant(request, username, password);
      const body = await res.json();
      await testInfo.attach('response.json', { body: JSON.stringify({ status: res.status(), body }, null, 2), contentType: 'application/json' });
      expect(res.status()).toBe(400);
      expect(body.error).toBe(error);
    });
  }

  test('refresh token rotates and the old one is rejected', async ({ request }) => {
    const first = await (await passwordGrant(request, 'rafiq', 'rafiq@1234')).json();
    const refresh = (rt: string) => request.post('/idp/connect/token', { form: { grant_type: 'refresh_token', refresh_token: rt } });

    const rotated = await refresh(first.refresh_token);
    expect(rotated.status()).toBe(200);
    const next = await rotated.json();
    expect(next.refresh_token).not.toBe(first.refresh_token);
    expect((await verifyWithIdpJwks(next.access_token)).signatureValid).toBe(true);

    const reused = await refresh(first.refresh_token);
    expect(reused.status()).toBe(400);
    expect((await reused.json()).error).toBe('invalid_grant');
  });

  // Regression for the former known gap: under the deprecated /mint flow the
  // emulator checked passwords itself, so a locked IdP account could still log in.
  test('locked account is refused by the IdP and cannot log into the emulator', async ({ page, request }, testInfo) => {
    const snap = evidence(page, testInfo);

    const grant = await passwordGrant(request, 'nasrin', demoPassword('nasrin'));
    expect((await grant.json()).error).toBe('account_locked');

    await page.goto('/');
    await page.getByLabel('User ID').fill('nasrin');
    await page.getByLabel('Password', { exact: true }).fill(demoPassword('nasrin'));
    const res = page.waitForResponse((r) => r.url().endsWith('/idp/connect/token'));
    await page.getByRole('button', { name: 'Log In' }).click();
    expect((await (await res).json()).error).toBe('account_locked');

    await expect(page.getByText('This account is locked. Contact your branch.')).toBeVisible();
    await expect(page.locator('.home__hello')).toHaveCount(0);
    expect(await readSession(page)).toBeNull();
    await snap('locked user nasrin refused');
  });
});
