/** Formatting helpers (EUR, dates, relative time). */
export function money(cents: number, opts: { sign?: boolean; compact?: boolean } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  let body: string;
  if (opts.compact && abs >= 1000) body = `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  else body = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = neg ? '−' : opts.sign ? '+' : '';
  return `${sign}€${body}`;
}

export function shortDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function dateTime(ts: number) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function time(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(ts);
}

export function memberSince(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
