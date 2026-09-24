import { useState } from 'react';
import { Icon } from '../components/Icon';
import { TxnItem, txnDirection } from '../components/TxnItem';
import { AppBar, Segmented } from '../components/ui';
import { QrImage } from '../components/widgets';
import { decodeP2pQr } from '../lib/emv';
import { maskAccount, money } from '../lib/format';
import { useLedger } from '../state/ledger';
import { useMyQrs } from '../state/myQrs';
import { useNav } from '../state/nav';
import { useCustomer } from '../state/session';

type Filter = 'all' | 'out' | 'in' | 'qrs';

export function Activity() {
  const customer = useCustomer();
  const nav = useNav();
  const { txns } = useLedger();
  const qrs = useMyQrs().filter((q) => q.username === customer.username);
  const [filter, setFilter] = useState<Filter>('all');

  const mine = txns.filter(
    (t) => t.payer.username === customer.username || (t.payee.username === customer.username && t.status === 'SUCCESS'),
  );
  const list = filter === 'all' ? mine : mine.filter((t) => txnDirection(t, customer.username) === filter);

  return (
    <div className="screen">
      <AppBar title="Activities" />
      <div className="screen__body">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'out', label: 'Sent' },
            { value: 'in', label: 'Received' },
            { value: 'qrs', label: 'My QRs' },
          ]}
        />
        {filter === 'qrs' ? (
          qrs.length === 0 ? (
            <p className="empty">You haven't generated any QR yet.</p>
          ) : (
            <div className="qrlist">
              {qrs.map((q) => (
                <button key={q.payload} className="qrlist__item" onClick={() => nav.push({ name: 'qr', qr: q })}>
                  <div className="qrlist__thumb">
                    <QrImage payload={q.payload} size={56} />
                  </div>
                  <div className="txn__text">
                    <strong>{q.mode === 'DYNAMIC' ? `Request · ${money(q.amount ?? 0)}` : 'Personal QR'}</strong>
                    <small>
                      {maskAccount(q.accountNumber)} · {new Date(q.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {decodeP2pQr(q.payload).institutionCode ?? '—'}
                    </small>
                  </div>
                  <Icon name="chevronRight" size={18} />
                </button>
              ))}
            </div>
          )
        ) : list.length === 0 ? (
          <p className="empty">No transactions to show.</p>
        ) : (
          <div className="card card--flat">
            {list.map((t) => (
              <TxnItem key={t.id} txn={t} username={customer.username} onClick={() => nav.push({ name: 'result', txn: t })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
