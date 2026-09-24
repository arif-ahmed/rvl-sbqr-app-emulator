// In-memory log of every call the emulated app makes, rendered by the
// Network Inspector next to the phone so testers can see exactly what the
// "SDK" sent to the FI backend and what came back.

import { useSyncExternalStore } from 'react';

export type NetTarget = 'BFF' | 'IdP';

export interface NetEntry {
  id: number;
  ts: number;
  target: NetTarget;
  method: string;
  path: string;
  status?: number;
  ms?: number;
  correlationId?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

let entries: NetEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const netlog = {
  start(e: Omit<NetEntry, 'id' | 'ts'>): number {
    const id = ++seq;
    entries = [{ ...e, id, ts: Date.now() }, ...entries].slice(0, 100);
    emit();
    return id;
  },
  finish(id: number, patch: Partial<NetEntry>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    emit();
  },
  clear() {
    entries = [];
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  snapshot: () => entries,
};

export function useNetlog(): NetEntry[] {
  return useSyncExternalStore(netlog.subscribe, netlog.snapshot);
}
