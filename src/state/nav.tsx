// Minimal stack navigator — mobile apps push/pop screens rather than route URLs.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ValidateQrResponse } from '../api/qr';
import type { P2pQr } from '../lib/emv';
import type { Txn } from './ledger';
import type { GeneratedQr } from './myQrs';
import type { PaymentDraft } from './payments';

export type QrSource = 'upload' | 'camera' | 'paste';

export type Screen =
  | { name: 'home' }
  | { name: 'receive'; tab?: 'STATIC' | 'DYNAMIC' }
  | { name: 'qr'; qr: GeneratedQr; fresh?: boolean }
  | { name: 'pay' }
  | { name: 'decoded'; payload: string; source: QrSource }
  | { name: 'review'; parsed: P2pQr; validation: ValidateQrResponse }
  | { name: 'otp'; draft: PaymentDraft }
  | { name: 'processing'; draft: PaymentDraft }
  | { name: 'result'; txn: Txn }
  | { name: 'activity' }
  | { name: 'profile' };

interface NavValue {
  screen: Screen;
  depth: number;
  push(s: Screen): void;
  replace(s: Screen): void;
  back(): void;
  reset(s?: Screen): void;
}

const Ctx = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }]);

  const push = useCallback((s: Screen) => setStack((st) => [...st, s]), []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const reset = useCallback((s?: Screen) => setStack(s && s.name !== 'home' ? [{ name: 'home' }, s] : [{ name: 'home' }]), []);

  const value = useMemo(
    () => ({ screen: stack[stack.length - 1]!, depth: stack.length, push, replace, back, reset }),
    [stack, push, replace, back, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
