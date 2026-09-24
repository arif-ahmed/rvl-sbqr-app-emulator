// Simulated payment execution: debit → NPSB → recipient institution →
// response (spec Figure 1, steps 3–6). Nothing here touches sbqr.api; the
// QR has already been verified by the time a PaymentDraft exists.

import type { Customer } from '../data/customers';
import type { QrMode } from '../lib/emv';
import { randomId } from '../lib/format';
import { ledger, ownerOfPan, type Txn } from './ledger';
import { sim } from './sim';

export interface PaymentDraft {
  payload: string;
  payloadHash: string;
  qrMode: QrMode;
  amount: number;
  purpose?: string;
  fromAccountId: string;
  recipient: {
    name: string;
    pan: string;
    city?: string;
    institutionCode?: string;
    institutionName: string;
  };
}

export const FEE = 0;

function rrn(): string {
  const d = new Date();
  const julian = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const rand = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000_00;
  return `${String(d.getFullYear()).slice(-1)}${String(julian).padStart(3, '0')}${String(rand).padStart(8, '0')}`;
}

function decide(draft: PaymentDraft, customer: Customer): { code: string; reason: string } | null {
  const s = sim.get();
  const balance = ledger.balance(draft.fromAccountId);
  const from = customer.accounts.find((a) => a.id === draft.fromAccountId);

  if (s.outcome === 'decline') return { code: '05', reason: 'Declined by the recipient institution (NPSB response 05 — Do not honour).' };
  if (s.outcome === 'timeout') return { code: '91', reason: 'The recipient institution did not respond in time (NPSB response 91). No money was debited.' };
  if (s.outcome === 'success') return null;

  if (from && from.number === draft.recipient.pan) return { code: '12', reason: 'You cannot send money to the same account.' };
  if (draft.amount > s.perTxnLimit) return { code: '61', reason: `Amount exceeds your per-transaction limit of BDT ${s.perTxnLimit.toLocaleString('en-IN')}.` };
  if (draft.amount + FEE > balance) return { code: '51', reason: 'Insufficient balance in the selected account.' };
  if (s.enforceSingleUse && draft.qrMode === 'DYNAMIC' && ledger.isDynamicUsed(draft.payload))
    return { code: '94', reason: 'This payment request has already been paid.' };
  return null;
}

export async function executePayment(draft: PaymentDraft, customer: Customer): Promise<Txn> {
  await new Promise((r) => setTimeout(r, sim.get().latencyMs));

  const from = customer.accounts.find((a) => a.id === draft.fromAccountId)!;
  const failure = decide(draft, customer);
  const payeeOwner = ownerOfPan(draft.recipient.pan);

  const txn: Txn = {
    id: randomId('TXN', 12),
    rrn: rrn(),
    ts: Date.now(),
    status: failure ? 'FAILED' : 'SUCCESS',
    failureCode: failure?.code,
    failureReason: failure?.reason,
    amount: draft.amount,
    fee: FEE,
    qrMode: draft.qrMode,
    purpose: draft.purpose,
    payload: draft.payload,
    payloadHash: draft.payloadHash,
    payer: { username: customer.username, name: customer.name, accountId: from.id, accountNumber: from.number },
    payee: {
      ...draft.recipient,
      username: payeeOwner?.username,
      accountId: payeeOwner?.account.id,
    },
  };
  ledger.record(txn, { markDynamicKey: draft.qrMode === 'DYNAMIC' ? draft.payload : undefined });
  return { ...txn, balanceAfter: ledger.balance(from.id) };
}
