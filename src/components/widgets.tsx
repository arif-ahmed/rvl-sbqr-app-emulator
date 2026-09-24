import { useEffect, useState } from 'react';
import { BRAND } from '../config';
import type { Account } from '../data/customers';
import { maskAccount, money } from '../lib/format';
import { qrDataUrl } from '../lib/qrImage';
import { useLedger } from '../state/ledger';
import { Icon } from './Icon';
import { Sheet } from './ui';

export function BankMark({ size = 40, light }: { size?: number; light?: boolean }) {
  return (
    <div className={`bankmark ${light ? 'bankmark--light' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="11" fill={light ? '#ffffff' : '#0a2a5e'} />
        <path d="M11 12h8.5a8 8 0 0 1 0 16H11z" fill="none" stroke={light ? '#0a2a5e' : '#ffffff'} strokeWidth="3.2" />
        <circle cx="29" cy="13" r="3.4" fill="#e31e24" />
      </svg>
    </div>
  );
}

export function BrandTitle({ light }: { light?: boolean }) {
  return (
    <div className={`brandtitle ${light ? 'brandtitle--light' : ''}`}>
      <BankMark size={34} light={light} />
      <div>
        <strong>{BRAND.bankName}</strong>
        <small>{BRAND.tagline}</small>
      </div>
    </div>
  );
}

export function AccountPicker({
  accounts,
  value,
  onChange,
  label = 'Change Account Here',
  showBalance,
}: {
  accounts: Account[];
  value: string;
  onChange(id: string): void;
  label?: string;
  showBalance?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { balances } = useLedger();
  const selected = accounts.find((a) => a.id === value) ?? accounts[0]!;
  return (
    <div className="acctpicker">
      <span className="field__label">{label}</span>
      <button type="button" className="acctpicker__btn" onClick={() => setOpen(true)} disabled={accounts.length < 2}>
        <div>
          <strong>{selected.type}</strong>
          <small>{maskAccount(selected.number)}</small>
        </div>
        {showBalance && <span className="acctpicker__bal">{money(balances[selected.id] ?? 0)}</span>}
        {accounts.length > 1 && <Icon name="chevronDown" size={20} />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <h3 className="sheet__title">Select account</h3>
        <div className="acctlist">
          {accounts.map((a) => (
            <button
              key={a.id}
              className={`acctlist__item ${a.id === selected.id ? 'is-active' : ''}`}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
            >
              <div className="acctlist__icon">
                <Icon name="card" size={20} />
              </div>
              <div className="acctlist__text">
                <strong>{a.type}</strong>
                <small>{maskAccount(a.number)}</small>
              </div>
              <span className="acctlist__bal">{money(balances[a.id] ?? 0)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export function QrImage({ payload, badge, size = 220 }: { payload: string; badge?: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    qrDataUrl(payload, 520, badge ? 'H' : 'M').then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [payload, badge]);
  return (
    <div className="qrframe">
      <div className="qrframe__brand">
        <span className="bqr-bangla">BANGLA</span>
        <span className="bqr-qr">QR</span>
      </div>
      <div className="qrframe__img" style={{ width: size, height: size }}>
        {src ? <img src={src} alt="BanglaQR code" width={size} height={size} /> : <span className="spinner" />}
        {badge && <span className="qrframe__badge">{badge}</span>}
      </div>
    </div>
  );
}

export function Avatar({ name, tone = 'blue' }: { name: string; tone?: 'blue' | 'green' | 'white' }) {
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return <div className={`avatar avatar--${tone}`}>{init || '?'}</div>;
}
