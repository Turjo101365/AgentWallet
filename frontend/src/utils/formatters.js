export function truncateAddress(address, startChars = 6, endChars = 4) {
  if (!address || typeof address !== 'string') return 'Not connected';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function formatEth(val, decimals = 4) {
  if (val === undefined || val === null || isNaN(val)) return '0.0000';
  return parseFloat(val).toFixed(decimals);
}

export function formatGwei(val) {
  if (val === undefined || val === null || isNaN(val)) return '0.0';
  return parseFloat(val).toFixed(1);
}

export function formatUsd(val) {
  if (val === undefined || val === null || isNaN(val)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val);
}

export function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
