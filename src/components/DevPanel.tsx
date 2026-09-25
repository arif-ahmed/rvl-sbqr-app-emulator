// Tester console beside the device: backend health, a network inspector of
// every call the emulated app makes, and knobs for the simulated parts.

import { useEffect, useState } from 'react';
import { netlog, useNetlog, type NetEntry } from '../api/netlog';
import { BFF_TARGET, IDP_TARGET } from '../config';
import { shortTime } from '../lib/format';
import { ledger } from '../state/ledger';
import { sim, useSim, type ForcedOutcome } from '../state/sim';
import { Icon } from './Icon';

type Health = 'up' | 'down' | 'checking';

async function probe(url: string): Promise<Health> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

function useHealth() {
  const [bff, setBff] = useState<Health>('checking');
  const [idp, setIdp] = useState<Health>('checking');
  const check = () => {
    probe('/bff/health/ready').then(setBff);
    probe('/idp/.well-known/openid-configuration').then(setIdp);
  };
  useEffect(() => {
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, []);
  return { bff, idp, check };
}

function Dot({ h }: { h: Health }) {
  return <span className={`hdot hdot--${h}`} title={h} />;
}

export function DevPanel() {
  const [tab, setTab] = useState<'net' | 'sim' | 'guide'>('net');
  const health = useHealth();
  const entries = useNetlog();

  return (
    <aside className="devpanel">
      <div className="devpanel__head">
        <div>
          <strong>SBQR SDK Emulator</strong>
          <small>Test console</small>
        </div>
        <button className="devpanel__refresh" onClick={health.check} title="Re-check backends">
          <Icon name="refresh" size={16} />
        </button>
      </div>
      <div className="devpanel__health">
        <div>
          <Dot h={health.bff} /> FI Backend (BFF) <code>{BFF_TARGET}</code>
        </div>
        <div>
          <Dot h={health.idp} /> FI IdP <code>{IDP_TARGET}</code>
        </div>
      </div>

      <div className="devpanel__tabs">
        <button className={tab === 'net' ? 'is-active' : ''} onClick={() => setTab('net')}>
          Network {entries.length > 0 && <span className="count">{entries.length}</span>}
        </button>
        <button className={tab === 'sim' ? 'is-active' : ''} onClick={() => setTab('sim')}>
          Simulation
        </button>
        <button className={tab === 'guide' ? 'is-active' : ''} onClick={() => setTab('guide')}>
          Guide
        </button>
      </div>

      <div className="devpanel__body">
        {tab === 'net' && <Network entries={entries} />}
        {tab === 'sim' && <Simulation />}
        {tab === 'guide' && <Guide />}
      </div>
    </aside>
  );
}

function Network({ entries }: { entries: NetEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (entries.length === 0)
    return <p className="devpanel__empty">No calls yet. Log in, generate or scan a QR — every request to the FI IdP and BFF shows up here.</p>;
  return (
    <>
      <div className="net__toolbar">
        <button onClick={() => netlog.clear()}>Clear</button>
      </div>
      <ul className="net">
        {entries.map((e) => {
          const cls = e.status === undefined ? 'pending' : e.status >= 200 && e.status < 300 ? 'ok' : 'err';
          return (
            <li key={e.id} className={`net__item net__item--${cls}`}>
              <button className="net__row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <span className="net__status">{e.status === undefined ? '…' : e.status === 0 ? 'ERR' : e.status}</span>
                <span className="net__target">{e.target}</span>
                <span className="net__path">
                  {e.method} {e.path}
                </span>
                <span className="net__ms">{e.ms !== undefined ? `${e.ms} ms` : ''}</span>
              </button>
              {open === e.id && (
                <div className="net__detail">
                  <div className="net__meta">
                    {shortTime(e.ts)}
                    {e.correlationId && (
                      <>
                        {' '}· X-Correlation-Id <code>{e.correlationId}</code>
                      </>
                    )}
                  </div>
                  {e.error && <div className="net__error">{e.error}</div>}
                  <h5>Request</h5>
                  <pre>{pretty(e.requestBody)}</pre>
                  <h5>Response</h5>
                  <pre>{e.responseBody === undefined ? '—' : pretty(e.responseBody)}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function pretty(v: unknown): string {
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v, null, 2) ?? '';
  // Tokens are long and useless in the inspector — shorten them.
  return s.replace(/"(eyJ[\w-]{10})[\w.-]+"/g, '"$1…"');
}

function Simulation() {
  const s = useSim();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="simform">
      <label>
        <span>Settlement outcome</span>
        <select value={s.outcome} onChange={(e) => sim.set({ outcome: e.target.value as ForcedOutcome })}>
          <option value="auto">Auto — apply balance &amp; limit rules</option>
          <option value="success">Force success</option>
          <option value="decline">Force decline (NPSB 05)</option>
          <option value="timeout">Force timeout (NPSB 91)</option>
        </select>
      </label>
      <label>
        <span>Per-transaction limit (BDT)</span>
        <input type="number" min={1} value={s.perTxnLimit} onChange={(e) => sim.set({ perTxnLimit: Number(e.target.value) || 1 })} />
      </label>
      <label>
        <span>Settlement latency (ms)</span>
        <input type="number" min={0} step={100} value={s.latencyMs} onChange={(e) => sim.set({ latencyMs: Math.max(0, Number(e.target.value)) })} />
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.enforceSingleUse} onChange={(e) => sim.set({ enforceSingleUse: e.target.checked })} />
        <span>
          Single-use hook for dynamic QRs
          <small>Block paying the same dynamic QR twice (BRD §3)</small>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.enforceExpiry} onChange={(e) => sim.set({ enforceExpiry: e.target.checked })} />
        <span>
          Expiry hook for dynamic QRs
          <small>15 min, for QRs generated in this browser</small>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.bypassLocalChecks} onChange={(e) => sim.set({ bypassLocalChecks: e.target.checked })} />
        <span>
          Bypass on-device checks
          <small>Send CRC-broken / non-P2P payloads to the BFF anyway (negative testing)</small>
        </span>
      </label>
      <div className="simform__actions">
        <button onClick={() => sim.reset()}>Reset knobs</button>
        {confirmReset ? (
          <button
            className="danger"
            onClick={() => {
              ledger.reset();
              setConfirmReset(false);
            }}
          >
            Confirm: wipe balances &amp; history
          </button>
        ) : (
          <button onClick={() => setConfirmReset(true)}>Reset ledger…</button>
        )}
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="guide">
      <h4>End-to-end run</h4>
      <ol>
        <li>
          Start the FI IdP (<code>:5105</code>), sbqr.api (real or <code>fake-sbqr-api.js</code>) and the BFF (<code>:8080</code>). Both dots above
          should be green.
        </li>
        <li>
          <b>Tab A</b> — log in as <b>Fatema</b>. <i>My QR</i> (static) or <i>Request Money</i> (dynamic) → Generate → <i>Save image</i>.
        </li>
        <li>
          <b>Tab B</b> — open this page again, log in as <b>Rafiq</b>. <i>Scan &amp; Pay</i> → <i>Add QR from your gallery</i> → pick the saved PNG.
        </li>
        <li>Check the on-device results, then <i>Verify &amp; Continue</i>. This calls <code>POST /v1/qr/validate</code> through the BFF.</li>
        <li>Enter an amount (static only), confirm with any 6-digit OTP. Tab A shows <i>Payment Received</i> if its QR screen is open.</li>
      </ol>
      <h4>Negative cases</h4>
      <ul>
        <li>Pay the same dynamic QR twice → "already been used".</li>
        <li>OTP <code>000000</code> → wrong code (3 tries).</li>
        <li>Amount above balance / limit → failed transaction.</li>
        <li>Paste a tampered payload → CRC failure on device; enable <i>Bypass</i> to see sbqr.api's verdict.</li>
      </ul>
      <p className="guide__note">
        Each tab keeps its own login (sessionStorage). Balances, history and generated QRs are shared across tabs through localStorage.
      </p>
    </div>
  );
}
