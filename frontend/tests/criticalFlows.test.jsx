import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AppContext } from '../src/app/providers.jsx';
import { ProposalCard } from '../src/components/proposals/ProposalCard.jsx';
import { AccessGate } from '../src/components/wallet/AccessGate.jsx';
import { TxStatus } from '../src/components/wallet/TxStatus.jsx';
import { api, configureApi, ApiError } from '../src/lib/api.js';
import { formatAmount } from '../src/utils/formatters.js';

const config = {
  chainId: 31337,
  networkName: 'Hardhat Local',
  contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  explorerBaseUrl: null,
  chainReady: true,
  tokens: [{ symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, native: true }],
};

const typedData = {
  domain: { name: 'AgentWallet Operator Approval', version: '1', chainId: 31337, verifyingContract: config.contractAddress },
  types: { ApproveTransfer: [{ name: 'proposalId', type: 'string' }] },
  message: { proposalId: 'p-1' },
};

function proposal(overrides = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    intentId: '0x' + 'ab'.repeat(32),
    source: 'MANUAL',
    status: 'AWAITING_APPROVAL',
    token: config.tokens[0],
    recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    amountWei: '5000000000000000',
    amountFormatted: '0.005',
    expiresAt: Math.floor(Date.now() / 1000) + 120,
    policyResult: { passed: true, blockNumber: 7, checks: [{ id: 'PER_TX_LIMIT', passed: true, message: 'ok' }], violations: [] },
    simulation: { success: true, gasEstimate: '61234', maxNetworkFeeEth: '0.0001' },
    approvalTypedData: typedData,
    execution: null,
    ...overrides,
  };
}

function renderWith(ui, ctx = {}) {
  const value = { config, isOwner: true, getSigner: vi.fn(), session: { address: '0xf39F', token: 't' }, ...ctx };
  return { ...render(<AppContext.Provider value={value}>{ui}</AppContext.Provider>), value };
}

function mockFetch(handler) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return { ok: status < 400, status, json: async () => body };
  }));
  return calls;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('approval flow', () => {
  it('signs the exact typed data from the backend and sends a stable Idempotency-Key', async () => {
    const signer = { signTypedData: vi.fn(async () => '0x' + '1'.repeat(130)) };
    const calls = mockFetch(() => ({ status: 503, body: { success: false, error: { code: 'CHAIN_UNAVAILABLE', message: 'down' } } }));
    const { value } = renderWith(<ProposalCard proposal={proposal()} />, { getSigner: vi.fn(async () => signer) });

    fireEvent.click(screen.getByText('Confirm in wallet'));
    await screen.findByText('down');
    expect(value.getSigner).toHaveBeenCalled();
    expect(signer.signTypedData).toHaveBeenCalledWith(typedData.domain, typedData.types, typedData.message);
    const first = calls[0];
    expect(first.url).toMatch(/\/proposals\/11111111-2222-4333-8444-555555555555\/approve$/);
    expect(JSON.parse(first.init.body)).toEqual({ signature: '0x' + '1'.repeat(130) });
    const key = first.init.headers['Idempotency-Key'];
    expect(key).toMatch(/^approve-/);

    // A retry after a failure must reuse the same key so it can never double-approve.
    fireEvent.click(screen.getByText('Confirm in wallet'));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].init.headers['Idempotency-Key']).toBe(key);
  });

  it('does not sign when the wallet is on the wrong network', async () => {
    const calls = mockFetch(() => ({ body: { success: true, data: {} } }));
    renderWith(<ProposalCard proposal={proposal()} />, { getSigner: vi.fn(async () => { throw new Error('Wallet is on chain 1; switch to Hardhat Local (31337) first.'); }) });
    fireEvent.click(screen.getByText('Confirm in wallet'));
    await screen.findByText(/switch to Hardhat Local/);
    expect(calls).toHaveLength(0);
  });

  it('viewers cannot approve or reject', () => {
    renderWith(<ProposalCard proposal={proposal()} />, { isOwner: false });
    expect(screen.getByText('Confirm in wallet').closest('button').disabled).toBe(true);
    expect(screen.getByText('Decline payment').closest('button').disabled).toBe(true);
    expect(screen.getByText('Only the contract owner can approve.')).toBeTruthy();
  });

  it('an expired proposal offers no approval', () => {
    renderWith(<ProposalCard proposal={proposal({ expiresAt: Math.floor(Date.now() / 1000) - 1 })} />);
    expect(screen.queryByText('Confirm in wallet')).toBeNull();
    expect(screen.getByText('Expired')).toBeTruthy();
  });

  it('never shows success while the transaction only has a hash', () => {
    renderWith(<ProposalCard proposal={proposal({ status: 'SUBMITTED', approvalTypedData: null, execution: { status: 'SUBMITTED', txHash: '0x' + 'cd'.repeat(32) } })} />);
    expect(screen.getByText('Sent · awaiting confirmation')).toBeTruthy();
    expect(screen.queryByText('Payment completed')).toBeNull();
  });

  it('shows confirmed only for a CONFIRMED proposal and lists failures with their reason', () => {
    renderWith(<ProposalCard proposal={proposal({ status: 'CONFIRMED', approvalTypedData: null, execution: { status: 'CONFIRMED', txHash: '0x' + 'cd'.repeat(32), blockNumber: 9, gasUsed: '60000' } })} />);
    expect(screen.getByText('Payment completed')).toBeTruthy();
    cleanup();
    renderWith(<ProposalCard proposal={proposal({ status: 'POLICY_REJECTED', approvalTypedData: null, policyResult: { checks: [], violations: [{ id: 'RECIPIENT_ALLOWLISTED', message: 'Recipient is not on the on-chain allowlist' }] } })} />);
    expect(screen.getByText('Blocked by a safety rule', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Recipient is not on the on-chain allowlist')).toBeTruthy();
  });
});

describe('access gate and wallet tx status', () => {
  const base = { config, configError: null, hasWallet: true, busy: false, error: null, connect: vi.fn(), switchNetwork: vi.fn(), signIn: vi.fn() };

  it('blocks the console on the wrong network and offers a switch', () => {
    renderWith(<AccessGate><div>secret console</div></AccessGate>, { ...base, account: '0xabc', networkOk: false, session: null });
    expect(screen.queryByText('secret console')).toBeNull();
    fireEvent.click(screen.getByText('Switch network'));
    expect(base.switchNetwork).toHaveBeenCalled();
  });

  it('requires a signed-in session even on the right network', () => {
    renderWith(<AccessGate><div>secret console</div></AccessGate>, { ...base, account: '0xabc', networkOk: true, session: null });
    expect(screen.queryByText('secret console')).toBeNull();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('renders the console once connected, on-network and signed in', () => {
    renderWith(<AccessGate><div>secret console</div></AccessGate>, { ...base, account: '0xabc', networkOk: true, session: { address: '0xabc' } });
    expect(screen.getByText('secret console')).toBeTruthy();
  });

  it('TxStatus says pending until the receipt arrives', () => {
    const { rerender } = renderWith(<TxStatus tx={{ status: 'pending', hash: '0x' + 'ef'.repeat(32), label: 'Deposit' }} />);
    expect(screen.getByText(/Deposit: submitted, waiting for confirmation/)).toBeTruthy();
    rerender(
      <AppContext.Provider value={{ config }}>
        <TxStatus tx={{ status: 'confirmed', hash: '0x' + 'ef'.repeat(32), label: 'Deposit', blockNumber: 12 }} />
      </AppContext.Provider>,
    );
    expect(screen.getByText(/Deposit: confirmed in block 12/)).toBeTruthy();
  });
});

describe('api client', () => {
  it('attaches the bearer token and maps error payloads', async () => {
    const unauthorized = vi.fn();
    configureApi({ getToken: () => 'tok123', unauthorized });
    const calls = mockFetch(() => ({ status: 401, body: { success: false, error: { code: 'UNAUTHENTICATED', message: 'Session expired' } } }));
    await expect(api('/wallet/state')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok123');
    expect(unauthorized).toHaveBeenCalled();
    configureApi({ getToken: () => null, unauthorized: () => {} });
  });

  it('reports an unreachable backend as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await api('/config').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK_ERROR');
  });
});

describe('formatting', () => {
  it('formats decimal strings without floating point loss', () => {
    expect(formatAmount('12345678.123456789012345678', 18)).toBe('12,345,678.123456789012345678');
    expect(formatAmount('0.10000', 6)).toBe('0.1');
    expect(formatAmount('1000')).toBe('1,000');
    expect(formatAmount(null)).toBe('—');
  });
});
