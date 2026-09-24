// Authorise → process → result. Authentication is the institution's own
// (BRD §5.1 step 9: "SDK does not implement authentication"), simulated
// here as an OTP; settlement over NPSB is simulated in state/payments.ts.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { txnDirection } from '../components/TxnItem';
import { AppBar, Banner, Button, Rows, StatusIcon } from '../components/ui';
import { Avatar } from '../components/widgets';
import { dateTime, maskAccount, money } from '../lib/format';
import type { Txn } from '../state/ledger';
import { useNav } from '../state/nav';
import { executePayment, type PaymentDraft } from '../state/payments';
import { useCustomer } from '../state/session';

const WRONG_OTP = '000000';

export function Otp({ draft }: { draft: PaymentDraft }) {
  const customer = useCustomer();
  const nav = useNav();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [resendIn, setResendIn] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const from = customer.accounts.find((a) => a.id === draft.fromAccountId)!;

  useEffect(() => {
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      // Paste of the whole code.
      const next = clean.slice(0, 6).split('');
      setDigits([...next, ...Array(6 - next.length).fill('')]);
      refs.current[Math.min(5, next.length)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  }

  function confirm() {
    const code = digits.join('');
    if (code.length !== 6) return setError('Enter the 6-digit code.');
    if (code === WRONG_OTP) {
      const n = attempts + 1;
      setAttempts(n);
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
      if (n >= 3) {
        setError('Too many incorrect attempts. The payment was cancelled.');
        setTimeout(() => nav.reset(), 1800);
      } else setError(`Incorrect code. ${3 - n} attempt${3 - n === 1 ? '' : 's'} left.`);
      return;
    }
    nav.replace({ name: 'processing', draft });
  }

  return (
    <div className="screen">
      <AppBar title="Confirm Payment" />
      <div className="screen__body">
        <div className="confirm-card">
          <span className="muted small">You are sending</span>
          <div className="confirm-card__amt">{money(draft.amount)}</div>
          <div className="confirm-card__to">
            <Avatar name={draft.recipient.name} tone="green" />
            <div>
              <strong>{draft.recipient.name}</strong>
              <small>
                {maskAccount(draft.recipient.pan)} · {draft.recipient.institutionName}
              </small>
            </div>
          </div>
          <Rows rows={[['From', `${from.type} · ${maskAccount(from.number)}`], ...(draft.purpose ? ([['Purpose', draft.purpose]] as [string, string][]) : [])]} />
        </div>

        <div className="otp">
          <h3>Enter OTP</h3>
          <p className="muted small">We sent a 6-digit code to {customer.mobile.replace(/\d(?=[\d-]{4})/g, '•')}</p>
          <div className="otp__boxes">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoFocus={i === 0}
                aria-label={`OTP digit ${i + 1}`}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
                  if (e.key === 'Enter') confirm();
                }}
              />
            ))}
          </div>
          <button className="link" disabled={resendIn > 0} onClick={() => setResendIn(30)}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
          <p className="tester-note">Emulator: any 6 digits work · {WRONG_OTP} simulates a wrong OTP</p>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <div className="screen__footer">
          <Button icon="lock" onClick={confirm} disabled={attempts >= 3}>
            Confirm & Pay
          </Button>
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Debiting your account', 'Routing via NPSB', "Awaiting recipient's bank"];

export function Processing({ draft }: { draft: PaymentDraft }) {
  const customer = useCustomer();
  const nav = useNav();
  const started = useRef(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 750);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice — pay exactly once.
    started.current = true;
    executePayment(draft, customer).then((txn) => nav.replace({ name: 'result', txn }));
  }, [draft, customer, nav]);

  return (
    <div className="screen processing">
      <div className="processing__ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" className="track" />
          <circle cx="50" cy="50" r="42" className="arc" />
        </svg>
      </div>
      <h2>Payment in progress</h2>
      <p className="muted">{money(draft.amount)} to {draft.recipient.name}</p>
      <ul className="processing__steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-active' : ''}>
            <span className="processing__dot">{i < step ? <Icon name="check" size={12} stroke={3} /> : null}</span>
            {s}
          </li>
        ))}
      </ul>
      <p className="muted small">Please don't close the app.</p>
    </div>
  );
}

export function Result({ txn }: { txn: Txn }) {
  const customer = useCustomer();
  const nav = useNav();
  const ok = txn.status === 'SUCCESS';
  const incoming = txnDirection(txn, customer.username) === 'in';

  const rows: [string, ReactNode][] = [
    ['Transaction ID', <code>{txn.id}</code>],
    ['NPSB reference (RRN)', <code>{txn.rrn}</code>],
    ['Date & time', dateTime(txn.ts)],
    incoming
      ? ['From', `${txn.payer.name}`]
      : ['From', `${customer.accounts.find((a) => a.id === txn.payer.accountId)?.type ?? 'Account'} · ${maskAccount(txn.payer.accountNumber)}`],
    ['To', txn.payee.name],
    ['Recipient account', maskAccount(txn.payee.pan)],
    ['Recipient institution', txn.payee.institutionName],
    ['QR type', txn.qrMode === 'DYNAMIC' ? 'Dynamic (Tag 01 = 12)' : 'Static (Tag 01 = 11)'],
    ...(txn.purpose ? ([['Purpose', txn.purpose]] as [string, string][]) : []),
    ['Charge', money(txn.fee)],
  ];
  if (ok && !incoming && txn.balanceAfter !== undefined) rows.push(['Available balance', money(txn.balanceAfter)]);
  if (!ok) rows.push(['Response code', txn.failureCode ?? '—']);

  return (
    <div className="screen">
      <AppBar title={incoming ? 'Payment Received' : 'Payment Status'} onBack={() => nav.reset()} />
      <div className="screen__body result">
        <StatusIcon kind={ok ? 'success' : 'error'} />
        <h2>{ok ? (incoming ? 'Payment Received Successfully' : 'Payment Successful') : 'Transaction Failed'}</h2>
        <p className="muted">
          {ok ? (incoming ? `You have received money from ${txn.payer.name}.` : `You have paid ${txn.payee.name} successfully.`) : txn.failureReason}
        </p>
        <div className={`result__amt ${ok ? '' : 'is-failed'}`}>{money(txn.amount)}</div>
        <div className="card card--flat">
          <Rows rows={rows} />
        </div>
        <div className="screen__footer">
          {!ok && !incoming && (
            <Button variant="secondary" icon="scan" onClick={() => nav.reset({ name: 'pay' })}>
              Back to Scanner
            </Button>
          )}
          <Button onClick={() => nav.reset()}>Done</Button>
        </div>
      </div>
    </div>
  );
}
