/**
 * Backend API client. Attaches the wallet session token, normalizes errors and signals session
 * expiry. All authoritative data (balances, limits, statuses) comes from these responses.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let tokenProvider = () => null;
let onUnauthorized = () => {};

export function configureApi({ getToken, unauthorized }) {
  tokenProvider = getToken || tokenProvider;
  onUnauthorized = unauthorized || onUnauthorized;
}

export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = tokenProvider();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', `Backend unreachable at ${API_BASE}`, { cause: err.message });
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', `Backend returned a non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || payload?.success === false) {
    const e = payload?.error || {};
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, e.code || 'HTTP_ERROR', e.message || `Request failed (HTTP ${res.status})`, e.details);
  }
  return payload.data;
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body, opts = {}) => api(path, { ...opts, method: 'POST', body: body ?? {} });
export const put = (path, body, opts = {}) => api(path, { ...opts, method: 'PUT', body: body ?? {} });

const STALE_LOCAL_CHAIN = 'MetaMask has cached data from an earlier run of this local chain. In MetaMask open Settings → Advanced → Clear activity tab data, then try again.';

/** The wallet's own error, unwrapped from ethers' "could not coalesce error" and RPC envelopes. */
const innerError = (err) => err?.info?.error || err?.error || err?.data?.originalError || null;
const walletMessage = (err) => [innerError(err)?.message, innerError(err)?.data?.message, err?.message].filter((m) => typeof m === 'string').join(' ');

export function describeError(err) {
  if (!err) return '';
  if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err?.info?.error?.code === 4001) return 'You rejected the request in your wallet.';
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details) ? err.details.map((d) => d.message || d.path).join('; ') : err.details?.violations?.map((v) => v.message).join('; ');
    return details ? `${err.message}: ${details}` : err.message;
  }
  const raw = walletMessage(err);
  if (err.code === -32002 || err?.info?.error?.code === -32002 || /already pending/i.test(raw)) return 'Your wallet already has a request waiting. Open MetaMask and finish or reject it.';
  if (/nonce too high|invalid block tag|block number .* is ahead/i.test(raw)) return STALE_LOCAL_CHAIN;
  if (err.shortMessage === 'could not coalesce error') {
    const inner = innerError(err);
    const text = inner?.data?.message || inner?.message; // MetaMask puts the node's reason under "Internal JSON-RPC error."
    if (typeof text === 'string') return text.slice(0, 300);
  }
  return err.shortMessage || err.reason || err.message || String(err);
}
