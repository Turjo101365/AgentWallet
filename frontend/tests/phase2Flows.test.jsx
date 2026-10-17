import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../src/app/providers.jsx';
import { Automation } from '../src/pages/Automation.jsx';
import { Agent } from '../src/pages/Agent.jsx';
import { PolicySettingsCard } from '../src/components/wallet/PolicySettingsCard.jsx';

const ETH = '0x0000000000000000000000000000000000000000';
const config = { chainId: 31337, networkName: 'Hardhat Local', contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', tokens: [{ symbol: 'ETH', address: ETH, decimals: 18, native: true }] };
const grant = { domain: { name: 'AgentWallet Task Authorization', version: '1', chainId: 31337, verifyingContract: config.contractAddress }, types: { AuthorizeTask: [{ name: 'taskId', type: 'string' }] }, message: { taskId: 't-1' } };
const task = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', status: 'PENDING_AUTHORIZATION', kind: 'RECURRING', source: 'AGENT', title: 'Weekly retainer',
  amountFormatted: '0.002', token: config.tokens[0], recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', scheduleDescription: 'every Monday at 09:00 UTC',
  runsCount: 0, maxRuns: 8, nextRunAt: null, validUntil: 1900000000, useRlTiming: false, executionWindowSeconds: 0, grantTypedData: grant,
};

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
  const value = { config, isOwner: true, session: { address: '0xf39F', token: 't' }, getSigner: vi.fn(), ...ctx };
  return { ...render(<MemoryRouter><AppContext.Provider value={value}>{ui}</AppContext.Provider></MemoryRouter>), value };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('automation', () => {
  it('signs the task grant with exactly the backend typed data before activation', async () => {
    const signer = { signTypedData: vi.fn(async () => '0x' + '2'.repeat(130)) };
    const calls = route([
      ['/tasks/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/authorize', () => ({ body: { success: true, data: { ...task, status: 'ACTIVE' } } })],
      ['/tasks', () => ({ body: { success: true, data: [task] } })],
      ['/automation', () => ({ body: { success: true, data: { paused: false } } })],
      ['/recipients', () => ({ body: { success: true, data: [] } })],
    ]);
    renderWith(<Automation />, { getSigner: vi.fn(async () => signer) });
    fireEvent.click(await screen.findByText('Sign grant'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/authorize'))).toBe(true));
    expect(signer.signTypedData).toHaveBeenCalledWith(grant.domain, grant.types, grant.message);
    expect(calls.find((c) => c.url.endsWith('/authorize')).body).toEqual({ signature: '0x' + '2'.repeat(130) });
    expect(screen.getByText(/Signing authorizes up to 8 runs of exactly 0.002 ETH/)).toBeTruthy();
  });

  it('the stop-all control calls the automation pause endpoint', async () => {
    const calls = route([
      ['/automation/pause', () => ({ body: { success: true, data: { paused: true } } })],
      ['/automation', () => ({ body: { success: true, data: { paused: false } } })],
      ['/tasks', () => ({ body: { success: true, data: [] } })],
    ]);
    renderWith(<Automation />);
    fireEvent.click(await screen.findByText('Stop all automated payments'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/automation/pause') && c.method === 'POST')).toBe(true));
  });
});

describe('policy settings', () => {
  it('a loosening change needs an explicit second confirmation', async () => {
    let attempts = 0;
    const calls = route([
      ['/policy', (init) => {
        if ((init.method || 'GET') === 'GET') return { body: { success: true, data: { reserveFloors: {}, autoApprovalMaxPerTx: {}, allowContractRecipients: false, dailyUsdLimit: null, circuitBreaker: { maxConsecutiveFailures: 3, hourlyAutonomousOutflow: {} } } } };
        attempts += 1;
        const body = JSON.parse(init.body);
        if (!body.confirmLoosening) return { status: 409, body: { success: false, error: { code: 'LOOSENING_REQUIRES_OWNER_CONSOLE', message: 'loosens', details: { loosening: ['raise ETH auto-approval limit'] } } } };
        return { body: { success: true, data: {} } };
      }],
    ]);
    renderWith(<PolicySettingsCard />);
    const inputs = await screen.findAllByPlaceholderText('not set');
    fireEvent.change(inputs[1], { target: { value: '0.005' } });
    fireEvent.click(screen.getByText('Save policy'));
    await screen.findByText('This change loosens your risk policy');
    expect(screen.getByText(/raise ETH auto-approval limit/)).toBeTruthy();
    const firstPut = calls.find((c) => c.method === 'PUT');
    expect(firstPut.body.autoApprovalMaxPerTx).toEqual({ [ETH]: '5000000000000000' });
    expect(firstPut.body.confirmLoosening).toBeUndefined();
    fireEvent.click(screen.getByText('I understand, apply it'));
    await waitFor(() => expect(attempts).toBe(2));
    expect(calls.filter((c) => c.method === 'PUT')[1].body.confirmLoosening).toBe(true);
  });
});

describe('agent chat', () => {
  it('shows the unavailable reason instead of pretending to answer', async () => {
    route([['/agent/status', () => ({ body: { success: true, data: { llm: { available: false, reason: 'No LLM provider configured', provider: 'none' } } } })]]);
    renderWith(<Agent />);
    expect(await screen.findByText(/No LLM provider configured/)).toBeTruthy();
  });

  it('survives browsers whose scrollIntoView returns a Promise (Chrome 156) under StrictMode', async () => {
    // Regression: an effect that returned scrollIntoView's Promise crashed the page with
    // "destroy is not a function" when StrictMode re-ran effects or the page unmounted.
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => Promise.resolve();
    try {
      route([['/agent/status', () => ({ body: { success: true, data: { llm: { available: false, reason: 'No LLM provider configured', provider: 'none' } } } })]]);
      const value = { config, isOwner: true, session: { address: '0xf39F', token: 't' }, getSigner: vi.fn() };
      const { unmount } = render(
        <React.StrictMode>
          <MemoryRouter><AppContext.Provider value={value}><Agent /></AppContext.Provider></MemoryRouter>
        </React.StrictMode>,
      );
      expect(await screen.findByText(/No LLM provider configured/)).toBeTruthy();
      expect(() => unmount()).not.toThrow();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('renders the plan, tool statuses and actions rejected by trusted code', async () => {
    const conversation = {
      id: 'c1', title: 't',
      turns: [{
        id: 'turn1', userMessage: 'Send 0.005 ETH to 0xabc', status: 'COMPLETED', provider: 'anthropic', model: 'claude-opus-5-5', modelCalls: 2,
        plan: { goal: 'pay', steps: [{ description: 'propose the transfer', tool: 'propose_transfer' }] },
        toolInvocations: [{ id: 'i1', tool: 'record_plan', status: 'OK', input: {}, output: {} }, { id: 'i2', tool: 'propose_transfer', status: 'REJECTED', error: 'not on the on-chain allowlist', input: {}, output: {} }],
        finalText: 'That address is not allowlisted.', actions: [{ type: 'rejected', reason: 'not on the on-chain allowlist' }],
      }],
    };
    route([
      ['/agent/status', () => ({ body: { success: true, data: { llm: { available: true, provider: 'anthropic', model: 'claude-opus-5-5' } } } })],
      ['/agent/chat', () => ({ body: { success: true, data: { conversationId: 'c1', status: 'COMPLETED' } } })],
      ['/agent/conversations/c1', () => ({ body: { success: true, data: conversation } })],
      ['/agent/conversations', () => ({ body: { success: true, data: [] } })],
    ]);
    renderWith(<Agent />);
    fireEvent.change(await screen.findByPlaceholderText('Ask your AI assistant…'), { target: { value: 'Send 0.005 ETH to 0xabc' } });
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('Plan: pay')).toBeTruthy();
    expect(screen.getByText('REJECTED')).toBeTruthy();
    expect(screen.getByText(/Rejected by trusted code/)).toBeTruthy();
    expect(screen.getByText('That address is not allowlisted.')).toBeTruthy();
  });
});
