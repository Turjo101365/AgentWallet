import { describe, it, expect } from 'vitest';
import { Badge } from '../src/components/ui/Badge.jsx';
import { Button } from '../src/components/ui/Button.jsx';
import { truncateAddress, formatEth } from '../src/utils/formatters.js';

describe('Frontend Base UI Components & Utilities', () => {
  it('exports valid React components', () => {
    expect(Badge).toBeDefined();
    expect(Button).toBeDefined();
  });

  it('correctly truncates EVM addresses', () => {
    const address = '0x71C8412eD33ef08083a216F669B78D8210D3498B';
    const truncated = truncateAddress(address, 6, 4);
    expect(truncated).toBe('0x71C8...498B');
  });

  it('formats ETH balance with exact decimal places', () => {
    expect(formatEth(14.842, 4)).toBe('14.8420');
    expect(formatEth(0, 4)).toBe('0.0000');
  });
});
