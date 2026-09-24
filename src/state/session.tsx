// Logged-in account holder for this tab. Kept in sessionStorage (per tab)
// so two tabs can be two different customers paying each other.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { isFresh, signIn, type Tokens } from '../api/auth';
import type { TokenSource } from '../api/qr';
import { DEMO_PASSWORD, findCustomer, type Customer } from '../data/customers';

interface Stored {
  username: string;
  tokens: Tokens;
}

interface SessionValue {
  customer: Customer | null;
  tokens: Tokens | null;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  /** Bearer supplier for BFF calls; silently re-authenticates (emulates a refresh token). */
  tokenSource: TokenSource;
}

const KEY = 'sbqr-emu:session';
const Ctx = createContext<SessionValue | null>(null);

function load(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function save(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export class LoginError extends Error {}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(load);
  const ref = useRef(stored);
  ref.current = stored;

  const customer = stored ? (findCustomer(stored.username) ?? null) : null;

  const update = useCallback((s: Stored | null) => {
    ref.current = s;
    save(s);
    setStored(s);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const c = findCustomer(username);
      if (!c || password !== DEMO_PASSWORD) throw new LoginError('Incorrect user ID or password.');
      const tokens = await signIn(c.username, c.name);
      update({ username: c.username, tokens });
    },
    [update],
  );

  const logout = useCallback(() => update(null), [update]);

  const tokenSource = useCallback<TokenSource>(
    async (forceRefresh) => {
      const s = ref.current;
      if (!s) throw new LoginError('Not logged in.');
      if (!forceRefresh && isFresh(s.tokens)) return s.tokens.accessToken;
      const c = findCustomer(s.username)!;
      const tokens = await signIn(c.username, c.name);
      update({ username: s.username, tokens });
      return tokens.accessToken;
    },
    [update],
  );

  const value = useMemo(
    () => ({ customer, tokens: stored?.tokens ?? null, login, logout, tokenSource }),
    [customer, stored, login, logout, tokenSource],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** For screens that only render when logged in. */
export function useCustomer(): Customer {
  const { customer } = useSession();
  if (!customer) throw new Error('No logged-in customer');
  return customer;
}
