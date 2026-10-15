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
