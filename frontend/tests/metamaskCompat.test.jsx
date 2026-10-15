// Behaviours of the real MetaMask extension that the Playwright EIP-1193 bridge does not reproduce.
// Error shapes are MetaMask's own ({ code, message, data }), passed through the real ethers BrowserProvider.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BrowserProvider } from 'ethers';
import { AppProvider } from '../src/app/providers.jsx';
import { AccessGate } from '../src/components/wallet/AccessGate.jsx';
import { describeError } from '../src/lib/api.js';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const config = { chainId: 31337, networkName: 'Hardhat Local', contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', chainReady: true, walletRpcUrl: 'http://127.0.0.1:8545', tokens: [] };
const rpcError = (code, message, data) => Object.assign(new Error(message), { code, ...(data ? { data } : {}) });

function fakeMetaMask(handlers) {
  const calls = [];
  return {
    calls,
    on: () => {},
    removeListener: () => {},
    request: vi.fn(async ({ method, params }) => {
      calls.push({ method, params });
      const h = handlers[method];
      if (!h) throw rpcError(4200, `Unsupported method ${method}`);
      return typeof h === 'function' ? h(params) : h;
    }),
  };
}

function mount(ethereum) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: config }) })));
  return render(<AppProvider ethereum={ethereum}><AccessGate><div>console</div></AccessGate></AppProvider>);
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MetaMask compatibility', () => {
  it('shows a rejected connect popup instead of failing silently', async () => {
    mount(fakeMetaMask({ eth_accounts: [], eth_chainId: '0x7a69', eth_requestAccounts: () => { throw rpcError(4001, 'User rejected the request.'); } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByText('You rejected the request in your wallet.')).toBeTruthy();
  });

  it('explains a connect request that is already pending in MetaMask (-32002)', async () => {
    mount(fakeMetaMask({ eth_accounts: [], eth_chainId: '0x7a69', eth_requestAccounts: () => { throw rpcError(-32002, "Request of type 'wallet_requestPermissions' already pending for origin http://localhost:5173. Please wait."); } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByText(/already has a request waiting/)).toBeTruthy();
  });

  it('adds the chain when MetaMask Mobile nests 4902 inside -32603', async () => {
    const mm = fakeMetaMask({
      eth_accounts: [OWNER],
      eth_chainId: '0x1',
      wallet_switchEthereumChain: () => { throw rpcError(-32603, 'Unrecognized chain ID "0x7a69".', { originalError: { code: 4902 } }); },
      wallet_addEthereumChain: null,
    });
    mount(mm);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch network' }));
    await waitFor(() => expect(mm.calls.some((c) => c.method === 'wallet_addEthereumChain')).toBe(true));
    const added = mm.calls.find((c) => c.method === 'wallet_addEthereumChain').params[0];
    expect(added).toMatchObject({ chainId: '0x7a69', rpcUrls: ['http://127.0.0.1:8545'] });
  });

  it('shows why MetaMask refused to add the network', async () => {
    mount(fakeMetaMask({
      eth_accounts: [OWNER],
      eth_chainId: '0x1',
      wallet_switchEthereumChain: () => { throw rpcError(4902, 'Unrecognized chain ID "0x7a69".'); },
      wallet_addEthereumChain: () => { throw rpcError(-32602, 'Chain ID returned by RPC URL http://127.0.0.1:8545 does not match 0x7a69'); },
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Switch network' }));
    expect(await screen.findByText(/does not match 0x7a69/)).toBeTruthy();
  });

  it('turns "could not coalesce error" from a restarted Hardhat chain into a fix', async () => {
    const send = (data) => new BrowserProvider(fakeMetaMask({
      eth_chainId: '0x7a69',
      eth_sendTransaction: () => { throw rpcError(-32603, 'Internal JSON-RPC error.', data); },
    }), 31337).send('eth_sendTransaction', [{ from: OWNER, to: OWNER, value: '0x1' }]);
    const stale = await send({ code: -32000, message: "Nonce too high. Expected nonce to be 0 but got 4. Note that transactions can't be queued when automining." }).catch((e) => e);
    expect(stale.shortMessage).toBe('could not coalesce error'); // what users saw before
    expect(describeError(stale)).toMatch(/Clear activity tab data/);
    const other = await send({ code: -32000, message: 'execution reverted: NotAgent()' }).catch((e) => e);
    expect(describeError(other)).toBe('execution reverted: NotAgent()');
  });
});
