// QRs generated in this browser. Static QRs are "generated once and reused"
// (BRD §3), so the last one per account is kept as the customer's personal
// QR. Dynamic QRs are remembered with their generation time so the payer
// side can apply the institution expiry hook when the same browser pays it.

import { useSyncExternalStore } from 'react';
import { DYNAMIC_QR_TTL_MS } from '../config';

export interface GeneratedQr {
  payload: string;
  payloadHash: string;
  signatureKeyVersion: number;
  mode: 'STATIC' | 'DYNAMIC';
  createdAt: number;
  username: string;
  accountId: string;
  accountNumber: string;
  name: string;
  amount?: string;
  purpose?: string;
}

const KEY = 'sbqr-emu:qrs:v1';

function read(): GeneratedQr[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as GeneratedQr[];
  } catch {
    return [];
  }
}

let state = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = read();
    emit();
  }
});

export const myQrs = {
  add(qr: GeneratedQr) {
    state = [qr, ...state.filter((q) => q.payload !== qr.payload)].slice(0, 100);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    emit();
  },
  find: (payload: string) => state.find((q) => q.payload === payload),
  savedStatic: (accountId: string) => state.find((q) => q.mode === 'STATIC' && q.accountId === accountId),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: () => state,
};

export function useMyQrs(): GeneratedQr[] {
  return useSyncExternalStore(myQrs.subscribe, myQrs.snapshot);
}

export function expiresAt(qr: GeneratedQr): number {
  return qr.createdAt + DYNAMIC_QR_TTL_MS;
}
