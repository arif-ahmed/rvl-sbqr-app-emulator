// Tester-controlled knobs for the simulated parts of the flow (settlement,
// institution hooks). Persisted per browser.

import { useSyncExternalStore } from 'react';

export type ForcedOutcome = 'auto' | 'success' | 'decline' | 'timeout';

export interface SimSettings {
  /** auto = real rules (balance, limits); otherwise force the NPSB result. */
  outcome: ForcedOutcome;
  /** Single-use hook for dynamic QRs (BRD §3). */
  enforceSingleUse: boolean;
  /** Reject expired dynamic QRs generated in this browser (BRD §5.3). */
  enforceExpiry: boolean;
  /** Let a locally-invalid payload (CRC / structure) still go to the FI backend. */
  bypassLocalChecks: boolean;
  /** Per-transaction IBFT limit (BDT). */
  perTxnLimit: number;
  /** Simulated settlement latency. */
  latencyMs: number;
}

const KEY = 'sbqr-emu:sim:v1';

const DEFAULTS: SimSettings = {
  outcome: 'auto',
  enforceSingleUse: true,
  enforceExpiry: true,
  bypassLocalChecks: false,
  perTxnLimit: 500_000,
  latencyMs: 2200,
};

function read(): SimSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SimSettings>) };
  } catch {
    return DEFAULTS;
  }
}

let state = read();
const listeners = new Set<() => void>();

export const sim = {
  get: () => state,
  set(patch: Partial<SimSettings>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  reset() {
    sim.set(DEFAULTS);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useSim(): SimSettings {
  return useSyncExternalStore(sim.subscribe, sim.get);
}
