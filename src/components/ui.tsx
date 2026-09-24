import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useNav } from '../state/nav';
import { Icon, type IconName } from './Icon';

export function AppBar({
  title,
  onBack,
  right,
  dark,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  dark?: boolean;
}) {
  const nav = useNav();
  return (
    <header className={`appbar ${dark ? 'appbar--dark' : ''}`}>
      <button className="icon-btn" aria-label="Back" onClick={onBack ?? nav.back}>
        <Icon name="back" />
      </button>
      <h1>{title}</h1>
      <div className="appbar__right">{right ?? <span className="icon-btn icon-btn--ghost" />}</div>
    </header>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline-light';

export function Button({
  variant = 'primary',
  icon,
  loading,
  block = true,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; loading?: boolean; block?: boolean }) {
  return (
    <button className={`btn btn--${variant} ${block ? 'btn--block' : ''}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner spinner--sm" /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange(v: T): void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`segmented__item ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  counter,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  counter?: { value: number; max: number };
  children: ReactNode;
}) {
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">
        {label}
        {counter && (
          <span className={`field__counter ${counter.value > counter.max ? 'is-over' : ''}`}>
            {counter.value}/{counter.max}
          </span>
        )}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose?: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet__grip" />
        {children}
      </div>
    </div>
  );
}

export function StatusIcon({ kind }: { kind: 'success' | 'error' | 'warning' }) {
  return (
    <div className={`status-icon status-icon--${kind}`}>
      <Icon name={kind === 'success' ? 'check' : kind === 'error' ? 'x' : 'alert'} size={46} stroke={2.6} />
    </div>
  );
}

export function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="rows">
      {rows.map(([k, v], i) => (
        <div className="rows__row" key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Banner({ kind, title, children }: { kind: 'error' | 'warning' | 'info' | 'success'; title?: string; children: ReactNode }) {
  const icon: IconName = kind === 'success' ? 'shield' : kind === 'info' ? 'info' : 'alert';
  return (
    <div className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon} size={20} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Chip({ tone = 'neutral', children }: { tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  return <span className={`chip chip--${tone}`}>{children}</span>;
}

/** Transient toast anchored to the phone screen. */
let pushToast: ((msg: string) => void) | null = null;
export function toast(msg: string) {
  pushToast?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2600);
    };
    return () => {
      pushToast = null;
      clearTimeout(t);
    };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}
