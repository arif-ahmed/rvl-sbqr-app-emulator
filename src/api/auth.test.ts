import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, refresh, signIn } from './auth';
import { netlog } from './netlog';

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

function respond(status: number, body: object) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => netlog.clear());
afterEach(() => vi.unstubAllGlobals());

describe('signIn', () => {
  it('sends a form-encoded password grant to the IdP token endpoint', async () => {
    const fetchMock = respond(200, { access_token: jwt({ sub: 'user-fatema', exp: 9_999_999_999 }), refresh_token: 'rt-1' });

    const tokens = await signIn('fatema', 'fatema@1234');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/idp/connect/token');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'password',
      username: 'fatema',
      password: 'fatema@1234',
    });
    expect(tokens).toMatchObject({ refreshToken: 'rt-1', claims: { sub: 'user-fatema' } });
  });

  it('never writes the password to the dev-panel network log', async () => {
    respond(200, { access_token: jwt({}), refresh_token: 'rt' });
    await signIn('fatema', 'fatema@1234');
    expect(netlog.snapshot()[0].requestBody).toEqual({ grant_type: 'password', username: 'fatema', password: '••••••' });
  });

  it.each([
    ['invalid_grant', 'Incorrect username or password.'],
    ['account_locked', 'This account is locked. Contact your branch.'],
    ['password_expired', 'Password expired. Reset it at your branch, then try again.'],
  ])('maps OAuth error %s to an AuthError with the IdP description', async (error, description) => {
    respond(400, { error, error_description: description });
    const err = await signIn('x', 'y').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ code: error, message: description });
  });

  it('does not treat an unreachable IdP as bad credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const err = await signIn('x', 'y').catch((e) => e);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(err.unreachable).toBe(true);
  });
});

describe('refresh', () => {
  it('sends the refresh-token grant and masks the token in the log', async () => {
    const fetchMock = respond(200, { access_token: jwt({}), refresh_token: 'rt-2' });
    const tokens = await refresh('rt-1');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ grant_type: 'refresh_token', refresh_token: 'rt-1' });
    expect(netlog.snapshot()[0].requestBody).toEqual({ grant_type: 'refresh_token', refresh_token: '••••••' });
    expect(tokens.refreshToken).toBe('rt-2');
  });
});
