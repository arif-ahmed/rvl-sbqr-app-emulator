import { useEffect, useRef } from 'react';
import { DevPanel } from './components/DevPanel';
import { PhoneFrame } from './components/PhoneFrame';
import { ToastHost, toast } from './components/ui';
import { money } from './lib/format';
import { useLedger } from './state/ledger';
import { NavProvider, useNav } from './state/nav';
import { SessionProvider, useSession } from './state/session';
import { Activity } from './screens/Activity';
import { Decoded } from './screens/Decoded';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Otp, Processing, Result } from './screens/Pay.flow';
import { Pay } from './screens/Pay';
import { Profile } from './screens/Profile';
import { QrDisplay } from './screens/QrDisplay';
import { Receive } from './screens/Receive';
import { Review } from './screens/Review';

function Screens() {
  const { screen } = useNav();
  switch (screen.name) {
    case 'home':
      return <Home />;
    case 'receive':
      return <Receive key={screen.tab} initialTab={screen.tab} />;
    case 'qr':
      return <QrDisplay qr={screen.qr} fresh={screen.fresh} />;
    case 'pay':
      return <Pay />;
    case 'decoded':
      return <Decoded payload={screen.payload} source={screen.source} />;
    case 'review':
      return <Review parsed={screen.parsed} validation={screen.validation} />;
    case 'otp':
      return <Otp draft={screen.draft} />;
    case 'processing':
      return <Processing draft={screen.draft} />;
    case 'result':
      return <Result txn={screen.txn} />;
    case 'activity':
      return <Activity />;
    case 'profile':
      return <Profile />;
  }
}

/** "Push notification" when another tab pays this customer. */
function IncomingCredits({ username }: { username: string }) {
  const { txns } = useLedger();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const credits = txns.filter((t) => t.payee.username === username && t.status === 'SUCCESS');
    if (!seen.current) {
      seen.current = new Set(credits.map((t) => t.id));
      return;
    }
    for (const t of credits) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      toast(`You received ${money(t.amount)} from ${t.payer.name}`);
    }
  }, [txns, username]);
  return null;
}

function Device() {
  const { customer } = useSession();
  const { screen } = useNav();
  const darkStatus = !customer || screen.name === 'home' || screen.name === 'pay';
  return (
    <PhoneFrame darkStatus={darkStatus}>
      {customer ? (
        <>
          <IncomingCredits username={customer.username} />
          <Screens />
        </>
      ) : (
        <Login />
      )}
      <ToastHost />
    </PhoneFrame>
  );
}

function Stage() {
  const { customer } = useSession();
  // New login → fresh navigation stack.
  return (
    <NavProvider key={customer?.username ?? 'anon'}>
      <Device />
    </NavProvider>
  );
}

export function App() {
  return (
    <SessionProvider>
      <div className="sandbox-banner" role="alert">
        SBQR TEST ENVIRONMENT — SDK emulator, not a real bank. Do not enter real banking
        credentials.
      </div>
      <main className="stage">
        <section className="stage__device">
          <div className="stage__caption">
            <span className="stage__badge">EMULATOR</span> FI mobile app · BanglaQR P2P
          </div>
          <Stage />
        </section>
        <DevPanel />
      </main>
    </SessionProvider>
  );
}
