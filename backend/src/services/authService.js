import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { unauthorized, forbidden, badRequest } from '../lib/errors.js';
import { normalizeAddress, sameAddress } from '../lib/address.js';
import { nowSeconds, toUnix } from '../lib/time.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * Sign-In with Ethereum (EIP-4361 message format) + opaque server-side sessions.
 *  - The server builds the exact message, so the client cannot change domain, chain or expiry.
 *  - Nonces are single-use (atomic UPDATE ... WHERE used_at IS NULL) and expire.
 *  - Session tokens are 32 random bytes; only their SHA-256 hash is stored.
 *  - Roles are not stored: "owner" is re-derived from the contract's owner() on each request.
 */
export function createAuthService({ config, repos, chain }) {
  const allowedOrigins = new Set([config.appOrigin, ...config.corsOrigins].flatMap((o) => {
    try {
      return [new URL(o).origin];
    } catch {
      return []; // e.g. "*": never used as a sign-in domain
    }
  }));

  /**
   * EIP-4361 binds the message to the site asking for it, and MetaMask warns ("suspicious sign-in
   * request") when the domain differs from the page's host. Use the request's Origin when it is one of
   * our allowed console origins (e.g. 127.0.0.1 vs localhost, or another Vite port); otherwise APP_ORIGIN.
   */
  function originFor(requestOrigin) {
    try {
      const o = requestOrigin && new URL(requestOrigin).origin;
      return o && allowedOrigins.has(o) ? o : new URL(config.appOrigin).origin;
    } catch {
      return new URL(config.appOrigin).origin;
    }
  }

  function buildMessage({ address, nonce, issuedAt, expiresAt, origin }) {
    return [
      `${new URL(origin).host} wants you to sign in with your Ethereum account:`,
      address,
      '',
      'Sign in to the AgentWallet operator console. This signature does not authorize any transaction or spending.',
      '',
      `URI: ${origin}`,
      'Version: 1',
      `Chain ID: ${config.chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(issuedAt * 1000).toISOString()}`,
      `Expiration Time: ${new Date(expiresAt * 1000).toISOString()}`,
    ].join('\n');
  }

  async function issueNonce(rawAddress, requestOrigin = null) {
    const address = normalizeAddress(rawAddress, 'address');
    const origin = originFor(requestOrigin);
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = nowSeconds();
    const expiresAt = issuedAt + config.nonceTtlSeconds;
    const message = buildMessage({ address, nonce, issuedAt, expiresAt, origin });
    await repos.auth.createNonce({ nonce, address, message, expiresAt });
    return { message, nonce, expiresAt };
  }

  async function verifySignIn({ message, signature }) {
    const match = /\nNonce: ([0-9a-f]{32})\n/.exec(message);
    if (!match) throw badRequest('INVALID_SIWE_MESSAGE', 'Message does not contain a valid nonce');
    let recovered;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      throw unauthorized('Invalid signature');
    }
    // Consume first so a nonce can never be tried twice, even with a bad signature.
    const row = await repos.auth.consumeNonce(match[1]);
    if (!row) throw unauthorized('Sign-in nonce is unknown, expired or already used');
    if (row.message !== message) throw unauthorized('Signed message does not match the issued challenge');
    if (!sameAddress(recovered, row.address)) throw unauthorized('Signature was not produced by the requested address');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = nowSeconds() + config.sessionTtlSeconds;
    const session = await repos.auth.createSession({ tokenHash: sha256(token), address: row.address, expiresAt });
    await repos.audit.append({ actor: row.address, action: 'AUTH_SIGN_IN', entityType: 'session', entityId: session.id, details: {} });
    return { token, address: row.address, expiresAt, role: await roleFor(row.address) };
  }

  async function authenticate(authorizationHeader) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(authorizationHeader || '');
    if (!m) throw unauthorized();
    const row = await repos.auth.findActiveSession(sha256(m[1]));
    if (!row) throw unauthorized('Session is invalid, expired or revoked');
    return { id: row.id, address: row.address, expiresAt: toUnix(row.expires_at) };
  }

  async function roleFor(address) {
    try {
      const owner = await chain.getOwner();
      return sameAddress(owner, address) ? 'owner' : 'viewer';
    } catch {
      return 'unknown';
    }
  }

  /** Throws unless the address is the current on-chain owner. Fails closed if the chain is unreachable. */
  async function assertOwner(address) {
    let owner;
    try {
      owner = await chain.getOwner();
    } catch (err) {
      const e = forbidden('Cannot confirm operator role: contract owner is unreadable');
      e.status = 503;
      e.code = 'ROLE_UNVERIFIABLE';
      throw e;
    }
    if (!sameAddress(owner, address)) throw forbidden('Only the AgentWallet contract owner may perform this action');
    return owner;
  }

  async function signOut(session) {
    await repos.auth.revokeSession(session.id);
    await repos.audit.append({ actor: session.address, action: 'AUTH_SIGN_OUT', entityType: 'session', entityId: session.id, details: {} });
  }

  return { buildMessage, issueNonce, verifySignIn, authenticate, roleFor, assertOwner, signOut };
}
