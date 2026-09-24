// Shows a generated QR in the app (BRD §5.1 step 4 / §5.2 step 4) with
// save/share, and pops "Payment Received" when another tab pays it.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { TlvTable } from '../components/TlvTable';
import { AppBar, Banner, Button, Chip, Rows, Sheet, StatusIcon, toast } from '../components/ui';
import { QrImage } from '../components/widgets';
import { BRAND } from '../config';
import { decodeP2pQr } from '../lib/emv';
import { amountDigits, maskAccount, money } from '../lib/format';
import { downloadBlob, qrCardPng } from '../lib/qrImage';
import { useLedger, type Txn } from '../state/ledger';
import { expiresAt, type GeneratedQr } from '../state/myQrs';
import { useNav } from '../state/nav';

function useCountdown(until: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, until - now) : null;
}

export function QrDisplay({ qr, fresh }: { qr: GeneratedQr; fresh?: boolean }) {
  const nav = useNav();
  const { txns } = useLedger();
  const [showDetails, setShowDetails] = useState(false);
  const [openedAt] = useState(Date.now());
  const [received, setReceived] = useState<Txn | null>(null);
  const parsed = useMemo(() => decodeP2pQr(qr.payload), [qr.payload]);

  const isDynamic = qr.mode === 'DYNAMIC';
  const remaining = useCountdown(isDynamic ? expiresAt(qr) : null);
  const expired = remaining === 0;

  // A credit for exactly this payload, arriving while the screen is open.
  useEffect(() => {
    const hit = txns.find((t) => t.payload === qr.payload && t.status === 'SUCCESS' && t.ts >= openedAt);
    if (hit && hit.id !== received?.id) setReceived(hit);
  }, [txns, qr.payload, openedAt, received?.id]);

  const paidAlready = isDynamic && txns.some((t) => t.payload === qr.payload && t.status === 'SUCCESS');
  const fileBase = `banglaqr-${qr.mode.toLowerCase()}-${qr.accountNumber.slice(-4)}${qr.amount ? `-${qr.amount}` : ''}`;

  async function makePng() {
    return qrCardPng(qr.payload, {
      bankName: BRAND.bankName,
      title: isDynamic ? 'Payment request' : 'Scan to pay me',
      name: qr.name,
      account: maskAccount(qr.accountNumber),
      amount: qr.amount ? money(qr.amount) : undefined,
      footer: 'Bangla QR · Person-to-Person · NPSB',
    });
  }

  async function download() {
    downloadBlob(await makePng(), `${fileBase}.png`);
    toast('QR image saved to Downloads');
  }

  async function share() {
    try {
      const file = new File([await makePng()], `${fileBase}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Bangla QR' });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    await download();
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(qr.payload);
      toast('QR payload copied');
    } catch {
      toast('Clipboard not available');
    }
  }

  const mm = remaining !== null ? Math.floor(remaining / 60000) : 0;
  const ss = remaining !== null ? Math.floor((remaining % 60000) / 1000) : 0;

  return (
    <div className="screen">
      <AppBar title={isDynamic ? 'Payment Request' : 'My QR'} onBack={() => (fresh ? nav.reset() : nav.back())} />
      <div className="screen__body">
        {fresh && <Banner kind="success">QR generated and signed by sbqr.api (key v{qr.signatureKeyVersion}).</Banner>}

        <div className={`qrcard ${expired || paidAlready ? 'is-dimmed' : ''}`}>
          <QrImage payload={qr.payload} badge={qr.amount ? `BDT ${amountDigits(Number(qr.amount))}` : undefined} size={200} />
          <div className="qrcard__who">
            <strong>{qr.name}</strong>
            <span>{maskAccount(qr.accountNumber)}</span>
          </div>
          <div className="qrcard__chips">
            <Chip tone={isDynamic ? 'amber' : 'blue'}>{isDynamic ? 'Dynamic · single use' : 'Static · reusable'}</Chip>
            {qr.purpose && <Chip>{qr.purpose === '***' ? 'Payer adds purpose' : qr.purpose}</Chip>}
          </div>
          {isDynamic && !paidAlready && (
            <div className={`countdown ${expired ? 'is-expired' : remaining! < 120_000 ? 'is-warn' : ''}`}>
              <Icon name="clock" size={16} />
              {expired ? 'Expired — create a new request' : `Expires in ${mm}:${String(ss).padStart(2, '0')}`}
            </div>
          )}
          {paidAlready && (
            <div className="countdown is-paid">
              <Icon name="check" size={16} /> Paid
            </div>
          )}
        </div>

        <p className="center muted small">Show this QR to your friends or family, or share the image, to receive the payment.</p>

        <div className="btn-row">
          <Button variant="secondary" icon="share" onClick={share}>
            Share
          </Button>
          <Button variant="secondary" icon="download" onClick={download}>
            Save image
          </Button>
        </div>

        <div className="collapsible">
          <button type="button" className="collapsible__head" onClick={() => setShowDetails((s) => !s)}>
            <div>
              <strong>Payload details</strong>
              <small>For testers · TLV, hash and signature</small>
            </div>
            <Icon name="chevronDown" size={20} className={showDetails ? 'rot180' : ''} />
          </button>
          {showDetails && (
            <div className="collapsible__body">
              <Rows
                rows={[
                  ['QR type', qr.mode],
                  ['Institution', parsed.institutionCode ?? '—'],
                  ['Signature key version', String(qr.signatureKeyVersion)],
                  ['Payload hash', <code className="mono-wrap">{qr.payloadHash}</code>],
                  ['CRC', parsed.crc.ok ? `${parsed.crc.declared} ✓` : `${parsed.crc.declared ?? '—'} ✗`],
                ]}
              />
              <TlvTable fields={parsed.fields} />
              <Button variant="ghost" icon="copy" onClick={copyPayload}>
                Copy raw payload
              </Button>
            </div>
          )}
        </div>

        <div className="screen__footer">
          <Button onClick={() => nav.reset()}>Done</Button>
        </div>
      </div>

      <Sheet open={Boolean(received)} onClose={() => setReceived(null)}>
        {received && (
          <div className="result-sheet">
            <StatusIcon kind="success" />
            <h2>Payment Received Successfully</h2>
            <p className="muted">
              {received.payer.name} paid you by scanning this QR.
            </p>
            <div className="result-sheet__amt">{money(received.amount)}</div>
            <Rows
              rows={[
                ['From', received.payer.name],
                ['Reference', received.rrn],
                ...(received.purpose ? ([['Purpose', received.purpose]] as [string, string][]) : []),
              ]}
            />
            <Button onClick={() => nav.reset()}>Done</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
