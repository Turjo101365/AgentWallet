import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../src/app/providers.jsx';
import { Automation } from '../src/pages/Automation.jsx';
import { ProposalCard } from '../src/components/proposals/ProposalCard.jsx';

// The owner transaction hook is replaced so the test sees exactly what the page asks the wallet contract to do.
const ownerTx = vi.hoisted(() => ({ wallet: null, result: null, state: { status: 'idle', error: null } }));
vi.mock('../src/hooks/useOwnerTx.js', () => ({
  useOwnerTx: () => ({
    state: ownerTx.state,
    reset: () => {},
    send: async (label, build) => {
      ownerTx.label = label;
      await build({ wallet: ownerTx.wallet, signer: {} });
      return ownerTx.result;
    },
  }),
}));

const ETH = '0x0000000000000000000000000000000000000000';
const DIGEST = '0x' + 'ab'.repeat(32);
const baseConfig = { chainId: 31337, networkName: 'Hardhat Local', contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }] };
const task = (over = {}) => ({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', status: 'ACTIVE', kind: 'RECURRING', source: 'AGENT', title: 'Weekly retainer',
  amountFormatted: '0.002', token: baseConfig.tokens[0], recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', scheduleDescription: 'every Monday at 09:00 UTC',
  runsCount: 1, maxRuns: 8, nextRunAt: null, validUntil: 1900000000, useRlTiming: false, executionWindowSeconds: 0,
  grantTypedData: { domain: {}, types: {}, message: {} }, grantSignature: '0x' + '1'.repeat(130), grantDigest: DIGEST, ...over,
});

function route(handlers) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    for (const [pattern, fn] of handlers) {
      if (u.includes(pattern)) {
        const { status = 200, body } = fn(init);
        return { ok: status < 400, status, json: async () => body };
      }
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
  }));
  return calls;
}

function renderWith(ui, ctx = {}) {
  const value = { config: { ...baseConfig, contractVersion: 2 }, isOwner: true, session: { address: '0xf39F', token: 't' }, getSigner: vi.fn(), ...ctx };
  return render(<MemoryRouter><AppContext.Provider value={value}>{ui}</AppContext.Provider></MemoryRouter>);
}

beforeEach(() => {
  sessionStorage.clear();
  ownerTx.wallet = { revokeGrant: vi.fn(async () => ({ hash: '0x' + 'cd'.repeat(32) })) };
  ownerTx.result = { status: 1, blockNumber: 7 };
  ownerTx.state = { status: 'idle', error: null };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const automationRoutes = (t) => [
  ['/cancel', () => ({ body: { success: true, data: { ...t, status: 'CANCELLED' } } })],
  ['/tasks', () => ({ body: { success: true, data: [t] } })],
  ['/automation', () => ({ body: { success: true, data: { paused: false } } })],
  ['/recipients', () => ({ body: { success: true, data: [] } })],
];

describe('grant revocation on contract v2', () => {
  it('revokes the exact signed grant digest on-chain, then cancels the task off-chain', async () => {
    const calls = route(automationRoutes(task()));
    renderWith(<Automation />);
    fireEvent.click(await screen.findByText('Revoke grant on-chain'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/cancel') && c.method === 'POST')).toBe(true));
    expect(ownerTx.wallet.revokeGrant).toHaveBeenCalledTimes(1);
    expect(ownerTx.wallet.revokeGrant).toHaveBeenCalledWith(DIGEST);
    expect(ownerTx.label).toBe('Revoke task grant');
    expect(calls.find((c) => c.url.endsWith('/cancel')).body).toEqual({ reason: 'Grant revoked on-chain by owner' });
  });

  it('does not report the task cancelled when the revocation transaction fails', async () => {
    ownerTx.result = null; // useOwnerTx returns null when the wallet rejects or the tx reverts
    ownerTx.state = { status: 'failed', error: new Error('user rejected the transaction') };
    const calls = route(automationRoutes(task()));
    renderWith(<Automation />);
    fireEvent.click(await screen.findByText('Revoke grant on-chain'));
    expect(await screen.findByText(/user rejected the transaction/)).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false);
  });

  it('a task already cancelled off-chain can still be revoked on-chain, without a second cancel', async () => {
    const calls = route(automationRoutes(task({ status: 'CANCELLED' })));
    renderWith(<Automation />);
    fireEvent.click(await screen.findByText('Revoke grant on-chain'));
    await waitFor(() => expect(ownerTx.wallet.revokeGrant).toHaveBeenCalledWith(DIGEST));
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false);
  });

  it('is not offered again once the grant is revoked on-chain, and says so', async () => {
    route(automationRoutes(task({ status: 'CANCELLED', grantRevokedOnChain: true })));
    renderWith(<Automation />);
    expect(await screen.findByText(/Grant revoked on-chain: the contract will refuse every remaining run/)).toBeTruthy();
    expect(screen.queryByText('Revoke grant on-chain')).toBeNull();
  });

  it('is not offered on the v1 contract, for unsigned tasks, or to a viewer', async () => {
    route(automationRoutes(task()));
    renderWith(<Automation />, { config: { ...baseConfig, contractVersion: 1 } });
    await screen.findByText('Weekly retainer');
    expect(screen.queryByText('Revoke grant on-chain')).toBeNull();
    cleanup();

    route(automationRoutes(task({ status: 'PENDING_AUTHORIZATION', grantSignature: null, grantDigest: null })));
    renderWith(<Automation />);
    await screen.findByText('Weekly retainer');
    expect(screen.queryByText('Revoke grant on-chain')).toBeNull();
    cleanup();

    route(automationRoutes(task()));
    renderWith(<Automation />, { isOwner: false });
    expect((await screen.findByText('Revoke grant on-chain')).closest('button').disabled).toBe(true);
  });
});

describe('signed execution deadline on the approval card', () => {
  const now = Math.floor(Date.now() / 1000);
  const proposal = (over = {}) => ({
    id: '2556bd41-3031-4b39-893e-a9b6389b0b95', status: 'AWAITING_APPROVAL', source: 'AGENT', amountFormatted: '0.0001', token: baseConfig.tokens[0],
    recipient: '0x82446B165d0d55051af76e3aD7852B0F3141904e', intentId: '0x' + '2e'.repeat(32), expiresAt: now + 120,
    approvalTypedData: { domain: {}, types: {}, message: { deadline: String(now + 120) } }, policyResult: { checks: [], violations: [] }, simulation: null, ...over,
  });

  it('shows the signed deadline as the execution cutoff and says it is never extended', async () => {
    renderWith(<ProposalCard proposal={proposal()} />);
    const note = screen.getByTestId('signed-deadline');
    expect(note.textContent).toMatch(/Execution deadline \(signed\)/);
    expect(note.textContent).toMatch(new Date((now + 120) * 1000).toLocaleString());
    expect(note.textContent).toMatch(/never extended/);
    expect(screen.getByText(/^Deadline in \d+m \d\ds$/)).toBeTruthy();
    expect(screen.getByText('Approve & sign').closest('button').disabled).toBe(false);
  });

  it('after the deadline the card offers no approval at all', async () => {
    renderWith(<ProposalCard proposal={proposal({ expiresAt: now - 1 })} />);
    expect(screen.getByText('Signed deadline passed')).toBeTruthy();
    expect(screen.queryByText('Approve & sign')).toBeNull();
    expect(screen.queryByTestId('signed-deadline')).toBeNull();
  });

  it('labels a v2 pre-signature simulation as a dry run with an estimated, not exact, gas figure', async () => {
    renderWith(<ProposalCard proposal={proposal({ simulation: { success: true, method: 'simulateTransfer', gasBasis: 'pre-signature', gasEstimate: '145936', maxNetworkFeeEth: '0.0001' } })} />);
    expect(screen.getByText('Full dry run before signing (simulateTransfer): succeeded')).toBeTruthy();
    expect(screen.getByText(/re-estimated exactly at execution/)).toBeTruthy();
  });
});
