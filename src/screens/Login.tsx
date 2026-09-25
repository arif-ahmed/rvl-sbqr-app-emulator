import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { Icon } from '../components/Icon';
import { Banner, Button } from '../components/ui';
import { BankMark } from '../components/widgets';
import { BRAND } from '../config';
import { CUSTOMERS, demoPassword } from '../data/customers';
import { LoginError, useSession } from '../state/session';

export function Login() {
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your user ID and password.');
      return;
    }
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      if (err instanceof LoginError) setError(err.message);
      else if (err instanceof ApiError && err.unreachable)
        setError('Cannot reach the identity provider. Is the FI IdP running on the configured port?');
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen login">
      <div className="login__hero">
        <div className="login__glow" />
        <BankMark size={64} light />
        <h1>{BRAND.bankName}</h1>
        <p>{BRAND.tagline}</p>
      </div>

      <form className="login__card" onSubmit={submit} noValidate>
        <h2>Welcome back</h2>
        <p className="muted">Log in to continue to your account</p>

        <label className="input-icon">
          <Icon name="user" size={18} />
          <input
            autoComplete="username"
            placeholder="User ID"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-label="User ID"
          />
        </label>
        <label className="input-icon">
          <Icon name="lock" size={18} />
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <button type="button" className="input-icon__action" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </label>
        <div className="login__row">
          <label className="check">
            <input type="checkbox" defaultChecked /> Remember me
          </label>
          <button type="button" className="link" onClick={() => setError('Password reset is not available in the emulator.')}>
            Forgot password?
          </button>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" loading={busy}>
          Log In
        </Button>

        <div className="login__demo">
          <span>Demo account holders · password <code>&lt;user&gt;@1234</code></span>
          <div className="login__chips">
            {CUSTOMERS.map((c) => (
              <button
                type="button"
                key={c.username}
                className="demochip"
                onClick={() => {
                  setUsername(c.username);
                  setPassword(demoPassword(c.username));
                  setError(null);
                }}
              >
                {c.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </form>

      <footer className="login__foot">
        <Icon name="shield" size={14} /> BanglaQR P2P · SDK emulator build
      </footer>
    </div>
  );
}
