// Simulated core-banking ledger shared by every tab of the emulator via
// localStorage. Two tabs logged in as different demo customers can therefore
// pay each other: the payer's tab debits, and — when the recipient PAN
// belongs to a demo customer — the payee's tab sees the credit arrive live
// (the `storage` event), just like a push notification in the real app.
//
// This is the "fake" part of the flow: sbqr.api only generates/validates;
// settlement over NPSB is simulated here.

import { useSyncExternalStore } from 'react';
import { CUSTOMERS, type Account } from '../data/customers';
import type { QrMode } from '../lib/emv';

export type TxnStatus = 'SUCCESS' | 'FAILED';

export interface Txn {
  id: string;
  /** NPSB retrieval reference number (12 digits). */
  rrn: string;
  ts: number;
  status: TxnStatus;
  failureCode?: string;
  failureReason?: string;
  amount: number;
  fee: number;
  qrMode: QrMode;
  purpose?: string;
  /** Raw QR payload that was paid — lets the payee screen match the credit. */
  payload: string;
  payloadHash: string;
  payer: { username: string; name: string; accountId: string; accountNumber: string };
  payee: {
    name: string;
    pan: string;
    city?: string;
    institutionCode?: string;
    institutionName: string;
    /** Set when the payee is a demo customer of this emulator. */
    username?: string;
    accountId?: string;
  };
  balanceAfter?: number;
}

interface LedgerState {
  balances: Record<string, number>;
  txns: Txn[];
  /** Dynamic QRs already paid: payload key → txn id (single-use hook, BRD §3). */
  usedDynamic: Record<string, string>;
}

const KEY = 'sbqr-emu:ledger:v1';

function initial(): LedgerState {
  const balances: Record<string, number> = {};
  for (const c of CUSTOMERS) for (const a of c.accounts) balances[a.id] = a.openingBalance;
  return { balances, txns: [], usedDynamic: {} };
}

function read(): LedgerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LedgerState;
      return { ...initial(), ...parsed, balances: { ...initial().balances, ...parsed.balances } };
    }
  } catch {
    /* storage blocked or corrupt — fall back to a fresh ledger */
  }
  return initial();
}

let state = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function write(next: LedgerState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* in-memory only */
  }
  emit();
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = read();
    emit();
  }
});

export const ledger = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: () => state,
  balance: (accountId: string) => state.balances[accountId] ?? 0,
  isDynamicUsed: (key: string) => Boolean(state.usedDynamic[key]),
  record(txn: Txn, opts: { markDynamicKey?: string }) {
    const balances = { ...state.balances };
    if (txn.status === 'SUCCESS') {
      balances[txn.payer.accountId] = round2((balances[txn.payer.accountId] ?? 0) - txn.amount - txn.fee);
      if (txn.payee.accountId) balances[txn.payee.accountId] = round2((balances[txn.payee.accountId] ?? 0) + txn.amount);
    }
    const usedDynamic = { ...state.usedDynamic };
    if (txn.status === 'SUCCESS' && opts.markDynamicKey) usedDynamic[opts.markDynamicKey] = txn.id;
    write({
      balances,
      usedDynamic,
      txns: [{ ...txn, balanceAfter: balances[txn.payer.accountId] }, ...state.txns].slice(0, 300),
    });
  },
  reset() {
    write(initial());
  },
};

export function useLedger(): LedgerState {
  return useSyncExternalStore(ledger.subscribe, ledger.snapshot);
}

/** Find which demo customer (if any) owns a PAN — for crediting the payee. */
export function ownerOfPan(pan?: string | null): { username: string; account: Account } | undefined {
  if (!pan) return undefined;
  for (const c of CUSTOMERS) {
    const account = c.accounts.find((a) => a.number === pan);
    if (account) return { username: c.username, account };
  }
  return undefined;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
