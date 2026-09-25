import { expect, test, type Page } from '@playwright/test';
import { AUDIENCE, IDP_ORIGIN, demoPassword, evidence, readSession, verifyWithIdpJwks } from './support';

// Login flow of the emulator against the real fi-idp-mock (dhakabank roster).
// Nothing on /idp is stubbed: every call goes browser → Vite proxy → IdP.

const ACTIVE_CUSTOMERS = [
  { username: 'fatema', name: 'Fatema Akter', customerId: 'CIF-00458821' },
  { username: 'rafiq', name: 'Rafiq Islam' },
  { username: 'karim', name: 'Karim Hossain' },
];

const idpHealthDot = (page: Page) => page.locator('.devpanel__health > div', { hasText: 'FI IdP' }).locator('.hdot');

async function openLogin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(idpHealthDot(page)).toHaveClass(/hdot--up/);
}

async function fillCredentials(page: Page, username: string, password: string) {
  await page.getByLabel('User ID').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
}

/** Submits the form and returns the IdP token-endpoint response it triggered. */
async function submit(page: Page) {
  const token = page.waitForResponse((r) => r.url().endsWith('/idp/connect/token'));
  await page.getByRole('button', { name: 'Log In' }).click();
  return token;
}

test.describe('Emulator login against real fi-idp-mock', () => {
  test('IdP is running and reachable through the emulator proxy', async ({ page, request }, testInfo) => {
    const snap = evidence(page, testInfo);

    const direct = await (await request.get(`${IDP_ORIGIN}/health`)).json();
    const viaProxy = await request.get('/idp/health');
    expect(viaProxy.ok()).toBe(true);
    const proxied = await viaProxy.json();
    await testInfo.attach('idp-health.json', { body: JSON.stringify({ direct, viaEmulatorProxy: proxied }, null, 2), contentType: 'application/json' });

    expect(proxied).toMatchObject({ status: 'ok', fi_id: 'dhakabank', issuer: IDP_ORIGIN });
    expect(proxied).toEqual(direct);

    const discovery = await (await request.get('/idp/.well-known/openid-configuration')).json();
    expect(discovery.issuer).toBe(IDP_ORIGIN);
    expect(discovery.token_endpoint).toBe(`${IDP_ORIGIN}/connect/token`);

    await openLogin(page);
    await expect(page.locator('.devpanel__health')).toContainText(IDP_ORIGIN);
    await snap('login screen, dev panel shows FI IdP up');
  });

  for (const c of [
    { case: 'wrong password', username: 'fatema', password: 'wrong-pass', error: 'invalid_grant', message: 'Incorrect username or password.' },
    { case: 'unknown user', username: 'ghost', password: demoPassword('ghost'), error: 'invalid_grant', message: 'Incorrect username or password.' },
    { case: 'expired password', username: 'jalal', password: demoPassword('jalal'), error: 'password_expired', message: 'Password expired. Reset it at your branch, then try again.' },
  ]) {
    test(`${c.case} is refused by the IdP (${c.error})`, async ({ page }, testInfo) => {
      const snap = evidence(page, testInfo);
      await openLogin(page);
      await fillCredentials(page, c.username, c.password);

      const res = await submit(page);
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe(c.error);

      await expect(page.getByText(c.message)).toBeVisible();
      expect(await readSession(page)).toBeNull();
      await snap(`${c.case} error from IdP`);
    });
  }

  test('error banner keeps the login card aligned (no sideways scroll)', async ({ page }, testInfo) => {
    const snap = evidence(page, testInfo);
    await openLogin(page);
    await fillCredentials(page, 'fatema', 'wrong-pass');
    await submit(page);
    await expect(page.getByText('Incorrect username or password.')).toBeVisible();

    const screen = page.locator('.screen.login');
    const { scrollLeft, scrollWidth, clientWidth } = await screen.evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollLeft).toBe(0);
    expect(scrollWidth).toBe(clientWidth);

    const phone = await page.locator('.phone__screen').boundingBox();
    const card = await page.locator('.login__card').boundingBox();
    expect(card!.x).toBeGreaterThan(phone!.x);
    expect(card!.x + card!.width).toBeLessThan(phone!.x + phone!.width);
    await snap('card inside phone after error');
  });

  test('empty credentials are caught before calling the IdP', async ({ page }, testInfo) => {
    const snap = evidence(page, testInfo);
    const idpCalls: string[] = [];
    page.on('request', (r) => r.url().includes('/idp/connect/token') && idpCalls.push(r.url()));

    await openLogin(page);
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByText('Enter your user ID and password.')).toBeVisible();
    expect(idpCalls).toHaveLength(0);
    await snap('empty credentials error');
  });

  for (const c of ACTIVE_CUSTOMERS) {
    test(`${c.name} (${c.username}) logs in with an IdP-signed token`, async ({ page }, testInfo) => {
      const snap = evidence(page, testInfo);
      await openLogin(page);
      await fillCredentials(page, c.username, demoPassword(c.username));
      await snap('credentials entered');

      const res = await submit(page);
      expect(res.status()).toBe(200);
      expect(res.request().headers()['content-type']).toBe('application/x-www-form-urlencoded');

      await expect(page.locator('.home__hello')).toContainText(c.name);
      await snap('home screen after login');

      // Dev panel network log: expand the IdP call to show request/response.
      const row = page.locator('.net__item', { hasText: '/connect/token' }).first();
      await expect(row.locator('.net__status')).toHaveText('200');
      await row.locator('.net__row').click();
      await expect(row).toContainText('"grant_type": "password"');
      await expect(row).toContainText('••••••');
      await expect(row).not.toContainText(demoPassword(c.username));
      await snap('dev panel IdP call expanded, password masked');

      const session = await readSession(page);
      expect(session?.username).toBe(c.username);
      expect(session?.tokens.refreshToken).toBeTruthy();
      const jwt = await verifyWithIdpJwks(session!.tokens.accessToken);
      await testInfo.attach('access-token.json', {
        body: JSON.stringify({ header: jwt.header, payload: jwt.payload, signatureValidAgainstIdpJwks: jwt.signatureValid }, null, 2),
        contentType: 'application/json',
      });

      expect(jwt.signatureValid).toBe(true);
      expect(jwt.header.alg).toBe('RS256');
      expect(jwt.payload).toMatchObject({
        iss: IDP_ORIGIN,
        aud: AUDIENCE,
        sub: `user-${c.username}`,
        name: c.name,
        preferred_username: c.username,
        fi_id: 'dhakabank',
        ...(c.customerId && { customer_id: c.customerId }),
      });
      expect(jwt.payload.exp * 1000).toBeGreaterThan(Date.now());
    });
  }

  test('user ID is case-insensitive', async ({ page }, testInfo) => {
    const snap = evidence(page, testInfo);
    await openLogin(page);
    await fillCredentials(page, '  Fatema ', demoPassword('fatema'));
    expect((await submit(page)).status()).toBe(200);
    await expect(page.locator('.home__hello')).toContainText('Fatema Akter');
    expect((await readSession(page))?.username).toBe('fatema');
    await snap('logged in with mixed-case user ID');
  });

  test('session survives reload and logout returns to login', async ({ page }, testInfo) => {
    const snap = evidence(page, testInfo);
    await openLogin(page);
    await fillCredentials(page, 'fatema', demoPassword('fatema'));
    await submit(page);
    await expect(page.locator('.home__hello')).toContainText('Fatema Akter');
    const before = await readSession(page);

    await page.reload();
    await expect(page.locator('.home__hello')).toContainText('Fatema Akter');
    expect((await readSession(page))?.tokens.accessToken).toBe(before?.tokens.accessToken);
    await snap('still logged in after reload');

    await page.getByRole('button', { name: 'Log out' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Log out?');
    await snap('logout confirmation');

    await dialog.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await readSession(page)).toBeNull();
    await snap('back on login screen');
  });
});
