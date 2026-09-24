import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { TxnItem } from '../components/TxnItem';
import { toast } from '../components/ui';
import { Avatar, BrandTitle } from '../components/widgets';
import { amountDigits, maskAccount } from '../lib/format';
import { useLedger } from '../state/ledger';
import { useNav, type Screen } from '../state/nav';
import { useCustomer, useSession } from '../state/session';

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const customer = useCustomer();
  const { logout } = useSession();
  const nav = useNav();
  const { balances, txns } = useLedger();
  const [idx, setIdx] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const account = customer.accounts[idx] ?? customer.accounts[0]!;
  const mine = txns.filter((t) => t.payer.username === customer.username || (t.payee.username === customer.username && t.status === 'SUCCESS'));
  const unread = mine.filter((t) => t.payee.username === customer.username && Date.now() - t.ts < 10 * 60_000).length;

  const actions: { icon: IconName; label: string; go: Screen; primary?: boolean }[] = [
    { icon: 'scan', label: 'Scan & Pay', go: { name: 'pay' }, primary: true },
    { icon: 'qr', label: 'My QR', go: { name: 'receive', tab: 'STATIC' } },
    { icon: 'request', label: 'Request Money', go: { name: 'receive', tab: 'DYNAMIC' } },
    { icon: 'history', label: 'Activity', go: { name: 'activity' } },
  ];
  const services: { icon: IconName; label: string }[] = [
    { icon: 'transfer', label: 'Fund Transfer' },
    { icon: 'bill', label: 'Bill Pay' },
    { icon: 'phone', label: 'Recharge' },
    { icon: 'card', label: 'Cards' },
  ];

  return (
    <div className="screen home">
      <div className="home__top">
        <div className="home__bar">
          <BrandTitle light />
          <div className="home__bar-actions">
            <button className="icon-btn icon-btn--glass" aria-label="Notifications" onClick={() => nav.push({ name: 'activity' })}>
              <Icon name="bell" size={20} />
              {unread > 0 && <span className="dot" />}
            </button>
            <button className="icon-btn icon-btn--glass" aria-label="Log out" onClick={() => setConfirmLogout(true)}>
              <Icon name="logout" size={20} />
            </button>
          </div>
        </div>

        <button className="home__hello" onClick={() => nav.push({ name: 'profile' })}>
          <Avatar name={customer.name} tone="white" />
          <div>
            <small>{greeting()},</small>
            <strong>{customer.name}</strong>
          </div>
          <span className="home__segment">{customer.segment}</span>
        </button>

        <div className="balcard">
          <div className="balcard__head">
            <span>{account.type}</span>
            <span className="balcard__num">{maskAccount(account.number)}</span>
          </div>
          <div className="balcard__label">Available balance</div>
          <div className="balcard__amt">
            <span className="balcard__cur">BDT</span>
            <span>{hidden ? '••••••' : amountDigits(balances[account.id] ?? 0)}</span>
            <button className="balcard__eye" onClick={() => setHidden((h) => !h)} aria-label={hidden ? 'Show balance' : 'Hide balance'}>
              <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} />
            </button>
          </div>
          {customer.accounts.length > 1 && (
            <div className="balcard__dots">
              {customer.accounts.map((a, i) => (
                <button key={a.id} className={i === idx ? 'is-active' : ''} onClick={() => setIdx(i)} aria-label={`Show ${a.type}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="home__body">
        <section className="actions">
          {actions.map((a) => (
            <button key={a.label} className={`action ${a.primary ? 'action--primary' : ''}`} onClick={() => nav.push(a.go)}>
              <span className="action__icon">
                <Icon name={a.icon} size={24} />
              </span>
              <span>{a.label}</span>
            </button>
          ))}
        </section>

        <section className="card">
          <div className="card__head">
            <h3>Other services</h3>
          </div>
          <div className="services">
            {services.map((s) => (
              <button key={s.label} className="service" onClick={() => toast(`${s.label} is outside the BanglaQR emulator scope`)}>
                <Icon name={s.icon} size={20} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h3>Recent activity</h3>
            {mine.length > 0 && (
              <button className="link" onClick={() => nav.push({ name: 'activity' })}>
                See all
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="empty">No transactions yet. Scan a BanglaQR to make your first P2P payment.</p>
          ) : (
            mine.slice(0, 4).map((t) => (
              <TxnItem key={t.id} txn={t} username={customer.username} onClick={() => nav.push({ name: 'result', txn: t })} />
            ))
          )}
        </section>
      </div>

      <nav className="tabbar">
        <button className="tabbar__item is-active">
          <Icon name="home" size={22} />
          Home
        </button>
        <button className="tabbar__item" onClick={() => nav.push({ name: 'activity' })}>
          <Icon name="history" size={22} />
          Activity
        </button>
        <button className="tabbar__fab" onClick={() => nav.push({ name: 'pay' })} aria-label="Scan and pay">
          <Icon name="scan" size={28} />
        </button>
        <button className="tabbar__item" onClick={() => nav.push({ name: 'receive', tab: 'STATIC' })}>
          <Icon name="qr" size={22} />
          Receive
        </button>
        <button className="tabbar__item" onClick={() => nav.push({ name: 'profile' })}>
          <Icon name="user" size={22} />
          Profile
        </button>
      </nav>

      {confirmLogout && (
        <div className="sheet-backdrop" onClick={() => setConfirmLogout(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <h3>Log out?</h3>
            <p>You will need to log in again to use {customer.name.split(' ')[0]}'s account.</p>
            <div className="dialog__actions">
              <button className="btn btn--secondary" onClick={() => setConfirmLogout(false)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
