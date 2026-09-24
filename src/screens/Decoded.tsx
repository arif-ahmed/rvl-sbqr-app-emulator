// What the Client SDK learned from the QR on-device (TLV, CRC, Tag 52
// routing, Tag 01 mode, institution hooks), then submission to the FI
// backend for signature verification against the BB trust store.

import { useMemo, useState } from 'react';
import { ApiError } from '../api/http';
import { validateQr, verdictMessage, type ValidateQrResponse } from '../api/qr';
import { Icon } from '../components/Icon';
import { TlvTable } from '../components/TlvTable';
import { AppBar, Banner, Button, Chip, Rows, Sheet, StatusIcon } from '../components/ui';
import { institutionName } from '../data/institutions';
import { decodeP2pQr, P2P_MCC } from '../lib/emv';
import { maskAccount, money } from '../lib/format';
import { ledger } from '../state/ledger';
import { expiresAt, myQrs } from '../state/myQrs';
import { useNav, type QrSource } from '../state/nav';
import { useSession } from '../state/session';
import { useSim } from '../state/sim';

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

const SOURCE_LABEL: Record<QrSource, string> = { upload: 'Gallery image', camera: 'Camera scan', paste: 'Pasted payload' };

export function Decoded({ payload, source }: { payload: string; source: QrSource }) {
  const nav = useNav();
  const { tokenSource } = useSession();
  const s = useSim();
  const qr = useMemo(() => decodeP2pQr(payload), [payload]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ title: string; message: string; verdict?: ValidateQrResponse } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const structuralOk = qr.fields.length > 0 && qr.errors.filter((e) => !e.startsWith('CRC')).length === 0;
  const checks: Check[] = [
    { label: 'QR payload parsed (EMV TLV)', ok: qr.fields.length > 0 && structuralOk, detail: structuralOk ? undefined : qr.errors.filter((e) => !e.startsWith('CRC')).join(' · ') },
    { label: 'CRC (Tag 63) valid', ok: qr.crc.ok, detail: qr.crc.ok ? qr.crc.declared ?? undefined : `expected ${qr.crc.computed}, found ${qr.crc.declared ?? 'none'}` },
    { label: `Tag 52 = ${P2P_MCC} → P2P route`, ok: qr.isP2p, detail: qr.isP2p ? undefined : `MCC ${qr.mcc ?? '—'} → P2M rules apply` },
    { label: 'Point of initiation (Tag 01)', ok: qr.mode !== 'UNSPECIFIED', detail: qr.mode === 'STATIC' ? '11 · Static' : qr.mode === 'DYNAMIC' ? '12 · Dynamic' : 'missing' },
    { label: 'Signature present (Tags 80/81)', ok: qr.signature.present },
  ];
  const localOk = checks.every((c) => c.ok);

  // Institution hooks (BRD §5.3) — only knowable for QRs generated in this browser / paid here.
  const generated = myQrs.find(payload);
  const expired = s.enforceExpiry && qr.mode === 'DYNAMIC' && generated ? Date.now() > expiresAt(generated) : false;
  const used = s.enforceSingleUse && qr.mode === 'DYNAMIC' && ledger.isDynamicUsed(payload);
  const hookBlock = expired
    ? { title: 'Request expired', message: 'This request has expired. Ask the sender to create a new one.' }
    : used
      ? { title: 'Already paid', message: 'This payment link has already been used.' }
      : null;

  const institution = institutionName(qr.account.institutionType, qr.account.institutionId);
  const canSubmit = !hookBlock && (localOk || s.bypassLocalChecks);

  async function verify() {
    setBusy(true);
    setFailure(null);
    try {
      const v = await validateQr(tokenSource, qr.raw);
      if (v.verdict === 'VALID') nav.replace({ name: 'review', parsed: qr, validation: v });
      else setFailure({ ...verdictMessage(v), verdict: v });
    } catch (e) {
      if (e instanceof ApiError && e.unreachable)
        setFailure({ title: 'Cannot verify right now', message: 'The FI backend is not reachable. The payment cannot continue until the QR is verified.' });
      else if (e instanceof ApiError && e.status === 400)
        setFailure({ title: 'QR appears damaged', message: `The FI backend rejected the payload: ${e.message}` });
      else setFailure({ title: 'Verification failed', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <AppBar title="QR Details" />
      <div className="screen__body">
        <div className="decoded__head">
          <div className="bqr-mini">
            <span className="bqr-bangla">BANGLA</span>
            <span className="bqr-qr">QR</span>
          </div>
          <div className="decoded__chips">
            <Chip tone={qr.isP2p ? 'green' : 'red'}>{qr.isP2p ? 'P2P' : 'Not P2P'}</Chip>
            {qr.mode !== 'UNSPECIFIED' && <Chip tone={qr.mode === 'DYNAMIC' ? 'amber' : 'blue'}>{qr.mode === 'DYNAMIC' ? 'Dynamic' : 'Static'}</Chip>}
            <Chip>{SOURCE_LABEL[source]}</Chip>
          </div>
        </div>

        {hookBlock && (
          <Banner kind="error" title={hookBlock.title}>
            {hookBlock.message}
          </Banner>
        )}

        <div className="card card--flat">
          <Rows
            rows={[
              ['Recipient',<strong>{qr.recipientName ?? '—'}</strong>],
              ['Account / wallet', maskAccount(qr.account.pan)],
              ['Institution', institution],
              ['City', [qr.recipientCity, qr.postalCode].filter(Boolean).join(' ') || '—'],
              ['Amount', qr.amount ? <strong>{money(qr.amount)}</strong> : <span className="muted">Entered by you on the next step</span>],
              ...(qr.purpose ? ([['Purpose', qr.purposeRequired ? 'You will be asked to enter one' : qr.purpose]] as [string, string][]) : []),
              ['Currency / country', `${qr.currency === '050' ? 'BDT (050)' : qr.currency ?? '—'} · ${qr.country ?? '—'}`],
            ]}
          />
        </div>

        <div className="card card--flat">
          <div className="card__head">
            <h3>On-device checks</h3>
            <Chip tone={localOk ? 'green' : 'red'}>{localOk ? 'Passed' : 'Failed'}</Chip>
          </div>
          <ul className="checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'is-ok' : 'is-bad'}>
                <Icon name={c.ok ? 'check' : 'x'} size={16} stroke={2.6} />
                <div>
                  <span>{c.label}</span>
                  {c.detail && <small>{c.detail}</small>}
                </div>
              </li>
            ))}
            <li className="is-pending">
              <Icon name="shield" size={16} />
              <div>
                <span>Ed25519 signature vs BB trust store</span>
                <small>Performed by the FI backend → sbqr.api</small>
              </div>
            </li>
          </ul>
        </div>

        {!hookBlock && !localOk && (
          <Banner kind={s.bypassLocalChecks ? 'warning' : 'error'} title={qr.isP2p || qr.fields.length === 0 ? 'This QR appears damaged' : 'Merchant QR'}>
            {qr.isP2p || qr.fields.length === 0
              ? 'The QR failed on-device checks. Please try again or request a fresh QR from the recipient.'
              : 'This is not a person-to-person Bangla QR. Merchant payments follow P2M rules and are not part of this flow.'}
            {s.bypassLocalChecks && ' (Tester override is on — you can still submit it to the FI backend.)'}
          </Banner>
        )}

        <div className="collapsible">
          <button type="button" className="collapsible__head" onClick={() => setShowRaw((v) => !v)}>
            <div>
              <strong>Raw QR data</strong>
              <small>{qr.raw.length} characters · {qr.fields.length} root tags</small>
            </div>
            <Icon name="chevronDown" size={20} className={showRaw ? 'rot180' : ''} />
          </button>
          {showRaw && (
            <div className="collapsible__body">
              <code className="raw-payload">{qr.raw}</code>
              {qr.fields.length > 0 && <TlvTable fields={qr.fields} />}
            </div>
          )}
        </div>

        <div className="screen__footer">
          <Button icon="shield" onClick={verify} loading={busy} disabled={!canSubmit}>
            {busy ? 'Verifying with FI backend…' : 'Verify & Continue'}
          </Button>
          <Button variant="ghost" onClick={() => nav.back()}>
            Scan another QR
          </Button>
        </div>
      </div>

      <Sheet open={Boolean(failure)} onClose={() => setFailure(null)}>
        {failure && (
          <div className="result-sheet">
            <StatusIcon kind="error" />
            <h2>{failure.title}</h2>
            <p className="muted">{failure.message}</p>
            {failure.verdict && (
              <div className="tester-note">
                verdict <b>{failure.verdict.verdict}</b>
                {failure.verdict.reasonCode && (
                  <>
                    {' '}· reason <b>{failure.verdict.reasonCode}</b>
                  </>
                )}
                {failure.verdict.institutionCode && <> · institution {failure.verdict.institutionCode}</>}
              </div>
            )}
            <Button onClick={() => nav.back()}>Back to Scanner</Button>
            <Button variant="ghost" onClick={() => setFailure(null)}>
              Close
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
