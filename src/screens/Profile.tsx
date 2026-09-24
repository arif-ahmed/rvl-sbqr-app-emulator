import { useEffect, useState } from 'react';
import { AppBar, Button, Rows } from '../components/ui';
import { Avatar } from '../components/widgets';
import { maskAccount, money } from '../lib/format';
import { useLedger } from '../state/ledger';
import { useCustomer, useSession } from '../state/session';

export function Profile() {
  const customer = useCustomer();
  const { tokens, logout } = useSession();
  const { balances } = useLedger();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const exp = tokens?.claims.exp ? tokens.claims.exp * 1000 : 0;
  const left = Math.max(0, Math.round((exp - now) / 1000));

  return (
    <div className="screen">
      <AppBar title="Profile" />
      <div className="screen__body">
        <div className="profile__head">
          <Avatar name={customer.name} />
          <strong>{customer.name}</strong>
          <span className="muted small">
            {customer.customerId} · {customer.segment}
          </span>
        </div>

        <div className="card card--flat">
          <div className="card__head">
            <h3>Personal information</h3>
          </div>
          <Rows
            rows={[
              ['Mobile', customer.mobile],
              ['Email', customer.email],
              ['City', [customer.city, customer.postalCode].filter(Boolean).join(' ')],
            ]}
          />
        </div>

        <div className="card card--flat">
          <div className="card__head">
            <h3>Accounts</h3>
          </div>
          <Rows rows={customer.accounts.map((a) => [`${a.type} · ${maskAccount(a.number)}`, money(balances[a.id] ?? 0)])} />
        </div>

        <div className="card card--flat">
          <div className="card__head">
            <h3>Session</h3>
            <span className={`chip ${left > 0 ? 'chip--green' : 'chip--amber'}`}>{left > 0 ? `expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'renews on next call'}</span>
          </div>
          <Rows
            rows={[
              ['sub', <code>{String(tokens?.claims.sub ?? '—')}</code>],
              ['iss', <code>{String(tokens?.claims.iss ?? '—')}</code>],
              ['aud', <code>{String(tokens?.claims.aud ?? '—')}</code>],
            ]}
          />
        </div>

        <div className="screen__footer">
          <Button variant="danger" icon="logout" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
