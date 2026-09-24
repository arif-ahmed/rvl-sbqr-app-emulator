import { amountDigits } from '../lib/format';
import type { Txn } from '../state/ledger';
import { Icon } from './Icon';

export function txnDirection(t: Txn, username: string): 'out' | 'in' {
  return t.payer.username === username ? 'out' : 'in';
}

export function TxnItem({ txn, username, onClick }: { txn: Txn; username: string; onClick?: () => void }) {
  const dir = txnDirection(txn, username);
  const failed = txn.status === 'FAILED';
  const counterparty = dir === 'out' ? txn.payee.name : txn.payer.name;
  const when = new Date(txn.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <button className="txn" onClick={onClick}>
      <div className={`txn__icon ${failed ? 'is-failed' : dir === 'in' ? 'is-in' : 'is-out'}`}>
        <Icon name={failed ? 'x' : dir === 'in' ? 'receive' : 'send'} size={18} />
      </div>
      <div className="txn__text">
        <strong>{counterparty}</strong>
        <small>
          {txn.qrMode === 'DYNAMIC' ? 'Dynamic QR' : 'Static QR'} · {when}
        </small>
      </div>
      <div className={`txn__amt ${failed ? 'is-failed' : dir === 'in' ? 'is-in' : ''}`}>
        {failed ? 'Failed' : `${dir === 'in' ? '+' : '−'} ${amountDigits(txn.amount)}`}
      </div>
    </button>
  );
}
