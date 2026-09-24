// Review screen (spec §2.6: recipient name from Tag 59, account from Tag 26
// sub 03, institution from sub 02). Static → payer enters the amount;
// Dynamic → amount comes from Tag 54 and is locked.

import { useState } from 'react';
import type { ValidateQrResponse } from '../api/qr';
import { Icon } from '../components/Icon';
import { AppBar, Banner, Button, Field, Rows } from '../components/ui';
import { AccountPicker, Avatar } from '../components/widgets';
import { LIMITS, QUICK_AMOUNTS } from '../config';
import { institutionName } from '../data/institutions';
import type { P2pQr } from '../lib/emv';
import { amountDigits, maskAccount, money, utf8Length } from '../lib/format';
import { useLedger } from '../state/ledger';
import { useNav } from '../state/nav';
import { FEE, type PaymentDraft } from '../state/payments';
import { useCustomer } from '../state/session';

export function Review({ parsed, validation }: { parsed: P2pQr; validation: ValidateQrResponse }) {
  const customer = useCustomer();
  const nav = useNav();
  const { balances } = useLedger();
  const isDynamic = parsed.mode === 'DYNAMIC';

  const [amount, setAmount] = useState(isDynamic ? (parsed.amount ?? '') : '');
  const [purpose, setPurpose] = useState('');
  const [fromId, setFromId] = useState(customer.accounts[0]!.id);
  const [touched, setTouched] = useState(false);

  const recipientName = validation.recipientName ?? parsed.recipientName ?? '—';
  const recipientPan = validation.recipientPan ?? parsed.account.pan ?? '';
  const institution = institutionName(parsed.account.institutionType, parsed.account.institutionId);
  // BRD §5.3 "information mismatch": what the backend verified must equal what we display.
  const mismatch =
    (validation.recipientName && parsed.recipientName && validation.recipientName !== parsed.recipientName) ||
    (validation.recipientPan && parsed.account.pan && validation.recipientPan !== parsed.account.pan);

  const n = Number(amount);
  const amountError = !amount || !/^\d+(\.\d{1,2})?$/.test(amount) || !(n > 0) ? 'Please enter a valid amount.' : undefined;
  const balance = balances[fromId] ?? 0;
  const purposeError = parsed.purposeRequired
    ? !purpose.trim()
      ? 'The recipient asks you to enter a purpose.'
      : utf8Length(purpose) > LIMITS.additional
        ? `Max ${LIMITS.additional} characters.`
        : undefined
    : undefined;

  function next() {
    setTouched(true);
    if (amountError || purposeError || mismatch) return;
    const draft: PaymentDraft = {
      payload: parsed.raw,
      payloadHash: validation.payloadHash,
      qrMode: parsed.mode,
      amount: Math.round(n * 100) / 100,
      purpose: parsed.purposeRequired ? purpose.trim() : parsed.purpose || purpose.trim() || undefined,
      fromAccountId: fromId,
      recipient: {
        name: recipientName,
        pan: recipientPan,
        city: parsed.recipientCity,
        institutionCode: validation.institutionCode ?? parsed.institutionCode,
        institutionName: institution,
      },
    };
    nav.push({ name: 'otp', draft });
  }

  return (
    <div className="screen">
      <AppBar title="Send Money" />
      <div className="screen__body">
        <div className="payee">
          <Avatar name={recipientName} tone="green" />
          <div className="payee__text">
            <strong>{recipientName}</strong>
            <span>{maskAccount(recipientPan)}</span>
            <span className="payee__bank">
              <Icon name="bank" size={14} /> {institution}
            </span>
          </div>
          <span className="verified" title={`trustSource: ${validation.trustSource ?? '—'}`}>
            <Icon name="shield" size={14} /> Verified
          </span>
        </div>

        {mismatch && (
          <Banner kind="error" title="Information mismatch">
            The recipient details verified by the FI backend do not match the QR. The payment has been blocked — please request a
            fresh QR.
          </Banner>
        )}

        {isDynamic ? (
          <div className="locked-amount">
            <span className="field__label">Amount</span>
            <div className="locked-amount__value">
              <span className="amount-input__cur">BDT</span>
              <span>{amountDigits(n)}</span>
              <Icon name="lock" size={18} />
            </div>
            <small className="muted">Set by the recipient in this payment request — it cannot be changed.</small>
          </div>
        ) : (
          <>
            <Field label="Enter amount" error={touched ? amountError : undefined}>
              <div className={`amount-input ${touched && amountError ? 'is-error' : ''}`}>
                <span className="amount-input__cur">BDT</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  aria-label="Amount in BDT"
                />
              </div>
            </Field>
            <div className="quick-amounts">
              {QUICK_AMOUNTS.map((q) => (
                <button key={q} className={`qa ${n === q ? 'is-active' : ''}`} onClick={() => setAmount(String(q))}>
                  {q.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </>
        )}

        {parsed.purposeRequired ? (
          <Field label="Purpose of payment" error={touched ? purposeError : undefined} hint="Required by the recipient">
            <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Rent for October" />
          </Field>
        ) : parsed.purpose ? (
          <Rows rows={[['Purpose', parsed.purpose]]} />
        ) : (
          <Field label="Note (optional)">
            <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What's this for?" maxLength={LIMITS.additional} />
          </Field>
        )}

        <AccountPicker accounts={customer.accounts} value={fromId} onChange={setFromId} label="Pay from" showBalance />
        {n > balance && !amountError && <Banner kind="warning">The amount is more than the available balance of this account.</Banner>}

        <div className="summary">
          <Rows
            rows={[
              ['Amount', money(amountError ? 0 : n)],
              ['Charge', money(FEE)],
              [<strong>Total</strong>, <strong>{money((amountError ? 0 : n) + FEE)}</strong>],
            ]}
          />
        </div>

        <div className="screen__footer">
          <Button onClick={next} disabled={Boolean(mismatch)}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
