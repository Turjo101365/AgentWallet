import { ethers } from 'ethers';
import { badRequest } from './errors.js';

const DECIMAL = /^(0|[1-9]\d{0,40})(\.\d{1,36})?$/;

/** Parses a user-supplied decimal amount into integer base units. Rejects anything ambiguous. */
export function parseAmount(value, decimals) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) {
    throw badRequest('INVALID_AMOUNT', 'Amount must be a positive decimal string such as "0.005"');
  }
  const fraction = value.split('.')[1] || '';
  if (fraction.length > decimals) {
    throw badRequest('INVALID_AMOUNT', `Amount has more than ${decimals} decimal places`);
  }
  const units = ethers.parseUnits(value, decimals);
  if (units <= 0n) throw badRequest('INVALID_AMOUNT', 'Amount must be greater than zero');
  if (units >= 2n ** 256n) throw badRequest('INVALID_AMOUNT', 'Amount is too large');
  return units;
}

export function formatAmount(units, decimals) {
  return ethers.formatUnits(BigInt(units), decimals);
}

export function toBigInt(value) {
  if (value === null || value === undefined) return null;
  return BigInt(value);
}
