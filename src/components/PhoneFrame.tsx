import { useEffect, useState, type ReactNode } from 'react';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Device chrome: bezel, status bar and home indicator around the app screen. */
export function PhoneFrame({ children, darkStatus }: { children: ReactNode; darkStatus?: boolean }) {
  const time = useClock();
  return (
    <div className="phone">
      <div className="phone__btn phone__btn--power" />
      <div className="phone__btn phone__btn--vol1" />
      <div className="phone__btn phone__btn--vol2" />
      <div className="phone__screen">
        <div className={`statusbar ${darkStatus ? 'statusbar--light' : ''}`}>
          <span className="statusbar__time">{time}</span>
          <span className="phone__island" />
          <span className="statusbar__icons" aria-hidden="true">
            <svg width="18" height="12" viewBox="0 0 18 12">
              <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
              <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
              <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12">
              <path d="M8 11.5l2.2-2.6a3.2 3.2 0 0 0-4.4 0z M3.1 6.5a7 7 0 0 1 9.8 0l1.4-1.6a9.2 9.2 0 0 0-12.6 0z M0 3.4a11.5 11.5 0 0 1 16 0L14.6 1.9A13.5 13.5 0 0 0 1.4 1.9z" fill="currentColor" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13">
              <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.45" />
              <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
              <path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="currentColor" opacity="0.5" />
            </svg>
          </span>
        </div>
        <div className="phone__content">{children}</div>
        <div className={`homebar ${darkStatus ? 'homebar--light' : ''}`} />
      </div>
    </div>
  );
}
