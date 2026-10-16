export function truncateAddress(address, startChars = 6, endChars = 4) {
  if (!address || typeof address !== 'string') return 'Not connected';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/** Formats a decimal string for display without converting through floating point. */
export function formatAmount(value, maxFraction = 6) {
  if (value === null || value === undefined || value === '') return '—';
  const [whole, fraction = ''] = String(value).split('.');
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function formatTimeAgo(timestamp) {
  if (!timestamp) return '—';
  const diff = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (diff < 0) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDateTime(unixOrIso) {
  if (!unixOrIso) return '—';
  const d = typeof unixOrIso === 'number' ? new Date(unixOrIso * 1000) : new Date(unixOrIso);
  return d.toLocaleString();
}

/** Gas price with a readable unit. Testnet prices can be far below 1 gwei, so tiny values switch to wei. */
export function formatGas(gwei) {
  const n = Number(gwei);
  if (gwei === null || gwei === undefined || gwei === '' || !Number.isFinite(n)) return '—';
  if (n === 0) return '0 gwei';
  if (n >= 1) return `${n.toFixed(2).replace(/\.?0+$/, '')} gwei`;
  if (n >= 0.001) return `${Number(n.toPrecision(3))} gwei`;
  return `${Number((n * 1e9).toPrecision(3))} wei`;
}

/** Ratio of two decimal strings as a 0-100 percentage, for display only (meters). */
export function percentOf(part, whole) {
  const p = Number(part);
  const w = Number(whole);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return 0;
  return Math.max(0, Math.min(100, (p / w) * 100));
}

export function humanizeAction(action) {
  return String(action || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
