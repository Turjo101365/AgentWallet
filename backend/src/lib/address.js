import { ethers } from 'ethers';
import { badRequest } from './errors.js';

/** Returns the EIP-55 checksummed address or throws a client error. Never returns the zero address. */
export function normalizeAddress(value, field = 'address', { allowZero = false } = {}) {
  if (typeof value !== 'string' || !ethers.isAddress(value)) {
    throw badRequest('INVALID_ADDRESS', `${field} must be a valid EVM address`);
  }
  const checksummed = ethers.getAddress(value);
  if (!allowZero && checksummed === ethers.ZeroAddress) {
    throw badRequest('INVALID_ADDRESS', `${field} must not be the zero address`);
  }
  return checksummed;
}

export function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}
