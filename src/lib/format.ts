const bdt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(n: number | string): string {
  const v = typeof n === 'string' ? Number(n) : n;
  return `BDT ${bdt.format(Number.isFinite(v) ? v : 0)}`;
}

export function amountDigits(n: number): string {
  return bdt.format(n);
}

/** "2011500000874" → "2011 **** **** 0874" — mirrors the reference screens. */
export function maskAccount(pan?: string | null): string {
  if (!pan) return '—';
  if (pan.length <= 8) return pan.replace(/.(?=.{3})/g, '*');
  return `${pan.slice(0, 4)} **** **** ${pan.slice(-4)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function shortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function randomId(prefix: string, len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  for (const b of buf) s += chars[b % chars.length];
  return `${prefix}${s}`;
}

export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}
