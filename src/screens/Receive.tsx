// Receive / Request money — generate a BanglaQR P2P code through the FI
// backend. Static = personal, reusable, no amount (Tag 01 = 11). Dynamic =
// one payment request with a fixed amount (Tag 01 = 12, Tag 54).

import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { generateDynamic, generateStatic, type GenerateStaticQrRequest } from '../api/qr';
import { Icon } from '../components/Icon';
import { AppBar, Banner, Button, Field, Segmented } from '../components/ui';
import { AccountPicker, QrImage } from '../components/widgets';
import { LIMITS, QUICK_AMOUNTS } from '../config';
import { amountDigits, maskAccount, utf8Length } from '../lib/format';
import { myQrs, useMyQrs, type GeneratedQr } from '../state/myQrs';
import { useNav } from '../state/nav';
import { useCustomer, useSession } from '../state/session';

type Mode = 'STATIC' | 'DYNAMIC';
type PurposeMode = 'none' | 'ask' | 'fixed';

export function Receive({ initialTab = 'STATIC' }: { initialTab?: Mode }) {
  const customer = useCustomer();
  const { tokenSource } = useSession();
  const nav = useNav();
  useMyQrs(); // re-render when saved QRs change

  const [mode, setMode] = useState<Mode>(initialTab);
  const [accountId, setAccountId] = useState(customer.accounts[0]!.id);
  const [name, setName] = useState(customer.name);
  const [city, setCity] = useState(customer.city);
  const [postalCode, setPostalCode] = useState(customer.postalCode ?? '');
  const [customerLabel, setCustomerLabel] = useState('');
  const [purposeMode, setPurposeMode] = useState<PurposeMode>('none');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [forceForm, setForceForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const account = customer.accounts.find((a) => a.id === accountId)!;
  const saved = mode === 'STATIC' && !forceForm ? myQrs.savedStatic(accountId) : undefined;

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required.';
    else if (utf8Length(name) > LIMITS.name) e.name = `Max ${LIMITS.name} characters (Tag 59).`;
    if (!city.trim()) e.city = 'City is required.';
    else if (utf8Length(city) > LIMITS.city) e.city = `Max ${LIMITS.city} characters (Tag 60).`;
    if (utf8Length(postalCode) > LIMITS.postalCode) e.postalCode = `Max ${LIMITS.postalCode} characters (Tag 61).`;
    if (utf8Length(customerLabel) > LIMITS.additional) e.customerLabel = `Max ${LIMITS.additional} characters.`;
    if (purposeMode === 'fixed') {
      if (!purpose.trim()) e.purpose = 'Enter a purpose or choose another option.';
      else if (utf8Length(purpose) > LIMITS.additional) e.purpose = `Max ${LIMITS.additional} characters (Tag 62-08).`;
    }
    if (mode === 'DYNAMIC') {
      const n = Number(amount);
      if (!amount) e.amount = 'Enter the amount you want to request.';
      else if (!/^\d+(\.\d{1,2})?$/.test(amount) || !(n > 0)) e.amount = 'Please enter a valid amount.';
      else if (n.toFixed(2).length > LIMITS.amountChars) e.amount = 'Amount is too large.';
    }
    return e;
  }, [name, city, postalCode, customerLabel, purposeMode, purpose, amount, mode]);

  const purposeValue = purposeMode === 'ask' ? '***' : purposeMode === 'fixed' ? purpose.trim() : undefined;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length) {
      if (errors.name || errors.city || errors.postalCode || errors.customerLabel) setShowDetails(true);
      return;
    }
    const base: GenerateStaticQrRequest = {
      recipientName: name.trim(),
      recipientCity: city.trim(),
      recipientPan: account.number,
      postalCode: postalCode.trim() || null,
      customerLabel: customerLabel.trim() || null,
      purposeOfTransaction: purposeValue ?? null,
    };
    setBusy(true);
    try {
      const txAmount = mode === 'DYNAMIC' ? Number(amount).toFixed(2) : undefined;
      const res =
        mode === 'STATIC'
          ? await generateStatic(tokenSource, base)
          : await generateDynamic(tokenSource, { ...base, transactionAmount: txAmount! });
      const qr: GeneratedQr = {
        payload: res.qrPayload,
        payloadHash: res.payloadHash,
        signatureKeyVersion: res.signatureKeyVersion,
        mode,
        createdAt: Date.now(),
        username: customer.username,
        accountId: account.id,
        accountNumber: account.number,
        name: base.recipientName,
        amount: txAmount,
        purpose: purposeValue,
      };
      myQrs.add(qr);
      setForceForm(false);
      nav.push({ name: 'qr', qr, fresh: true });
    } catch (e) {
      if (e instanceof ApiError && e.unreachable) setError('The FI backend is not reachable. Check that the BFF is running.');
      else if (e instanceof ApiError) setError(`QR generation was rejected (HTTP ${e.status}): ${e.message}`);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => (touched ? errors[k] : undefined);

  return (
    <div className="screen">
      <AppBar title={mode === 'STATIC' ? 'Receive Money' : 'Request Money'} />
      <form className="screen__body" onSubmit={submit} noValidate>
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setTouched(false);
            setError(null);
          }}
          options={[
            { value: 'STATIC', label: 'Static QR', icon: 'qr' },
            { value: 'DYNAMIC', label: 'Dynamic QR', icon: 'bolt' },
          ]}
        />
        <p className="mode-hint">
          {mode === 'STATIC'
            ? 'Your personal QR. Reusable — the payer enters the amount.'
            : 'A one-time payment request with a fixed amount. Expires in 15 minutes.'}
        </p>

        <AccountPicker accounts={customer.accounts} value={accountId} onChange={setAccountId} label="Receive into" />

        {saved ? (
          <div className="saved-qr">
            <QrImage payload={saved.payload} size={170} />
            <p className="center muted small">
              Personal QR for {maskAccount(saved.accountNumber)} · generated{' '}
              {new Date(saved.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <div className="btn-row">
              <Button type="button" variant="secondary" icon="refresh" onClick={() => setForceForm(true)}>
                Regenerate
              </Button>
              <Button type="button" icon="qr" onClick={() => nav.push({ name: 'qr', qr: saved })}>
                Show QR
              </Button>
            </div>
          </div>
        ) : (
          <>
            {mode === 'DYNAMIC' && (
              <>
                <Field label="Amount" error={err('amount')}>
                  <div className={`amount-input ${err('amount') ? 'is-error' : ''}`}>
                    <span className="amount-input__cur">BDT</span>
                    <input
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
                    <button
                      type="button"
                      key={q}
                      className={`qa ${Number(amount) === q ? 'is-active' : ''}`}
                      onClick={() => setAmount(String(q))}
                    >
                      {q.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </>
            )}

            <Field
              label="Purpose of transaction"
              error={err('purpose')}
              hint={purposeMode === 'ask' ? 'Encoded as "***" — the payer\'s app will ask them for a purpose.' : 'Optional · Tag 62 sub-tag 08'}
            >
              <div className="pills">
                {(
                  [
                    ['none', 'None'],
                    ['fixed', 'Add note'],
                    ['ask', 'Ask payer'],
                  ] as const
                ).map(([v, l]) => (
                  <button type="button" key={v} className={`pill ${purposeMode === v ? 'is-active' : ''}`} onClick={() => setPurposeMode(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {purposeMode === 'fixed' && (
                <input
                  className="input"
                  placeholder={mode === 'DYNAMIC' ? 'e.g. Dinner at Momo restaurant' : 'e.g. Rent'}
                  value={purpose}
                  maxLength={40}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              )}
            </Field>

            <div className="collapsible">
              <button type="button" className="collapsible__head" onClick={() => setShowDetails((s) => !s)}>
                <div>
                  <strong>Recipient details</strong>
                  <small>
                    {name || '—'} · {city || '—'} · {maskAccount(account.number)}
                  </small>
                </div>
                <Icon name="chevronDown" size={20} className={showDetails ? 'rot180' : ''} />
              </button>
              {showDetails && (
                <div className="collapsible__body">
                  <Field label="Account holder name" error={err('name')} counter={{ value: utf8Length(name), max: LIMITS.name }} hint="Tag 59 · signed with the account number">
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Account number" hint="Tag 26 sub-tag 03 · from the selected account">
                    <input className="input" value={account.number} readOnly />
                  </Field>
                  <div className="grid2">
                    <Field label="City" error={err('city')} counter={{ value: utf8Length(city), max: LIMITS.city }}>
                      <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
                    </Field>
                    <Field label="Postal code" error={err('postalCode')} hint="Optional">
                      <input className="input" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Customer label" error={err('customerLabel')} hint={'Optional · Tag 62-06 · "FT" marks a P2P fund transfer'}>
                    <div className="input-with-chip">
                      <input className="input" value={customerLabel} onChange={(e) => setCustomerLabel(e.target.value)} placeholder="e.g. FT" />
                      {customerLabel !== 'FT' && (
                        <button type="button" className="pill" onClick={() => setCustomerLabel('FT')}>
                          FT
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              )}
            </div>

            {error && <Banner kind="error">{error}</Banner>}

            <div className="screen__footer">
              <Button type="submit" loading={busy} icon="qr">
                {mode === 'STATIC'
                  ? 'Generate my QR'
                  : amount && !errors.amount
                    ? `Generate request · BDT ${amountDigits(Number(amount))}`
                    : 'Generate payment request'}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
