import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../app/providers.jsx';
import { get, post, describeError } from '../lib/api.js';
import { Card, CardContent, CardHeader } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { readAfterColdStart } from '../lib/coldStart.js';

const field = 'w-full rounded-xl border border-slate-300 p-3 bg-white text-sm';
const ext = { target: '_blank', rel: 'noopener noreferrer' };
const nav = [['/', 'Overview'], ['/judge/evidence', 'On-chain evidence'], ['/judge/agent', 'AI & risk analysis'], ['/judge/guide', 'Judge guide']];

export function Judge() {
  const { config } = useApp();
  const { pathname } = useLocation();
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('0.0001'), [recipient, setRecipient] = useState(''), [assessment, setAssessment] = useState(null);
  const [message, setMessage] = useState('Explain the authorization and security controls demonstrated by this contract.'), [analysis, setAnalysis] = useState(null);
  const [working, setWorking] = useState(false), [actionError, setActionError] = useState(null);
  const [attempt, setAttempt] = useState(1);
  const currentRead = useRef(null);
  async function refresh() {
    currentRead.current?.abort();
    const controller = new AbortController(); currentRead.current = controller;
    setLoading(true); setError(null);
    try { setData(await readAfterColdStart((signal) => get('/public/overview', { signal }), { signal: controller.signal, onAttempt: setAttempt })); }
    catch (e) { if (!controller.signal.aborted) setError(describeError(e)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { refresh(); return () => currentRead.current?.abort(); }, []);
  async function assess(e) {
    e.preventDefault(); setWorking(true); setActionError(null); setAssessment(null);
    try { setAssessment(await post('/public/assess', { token: config?.tokens?.[0]?.address || '0x0000000000000000000000000000000000000000', recipient: recipient || data.recipients[0]?.address, amount }, { signal: AbortSignal.timeout(20000) })); }
    catch (err) { setActionError(describeError(err)); }
    finally { setWorking(false); }
  }
  async function analyze(e) {
    e.preventDefault(); setWorking(true); setActionError(null); setAnalysis(null);
    try { setAnalysis(await post('/public/analyze', { message }, { signal: AbortSignal.timeout(60000) })); }
    catch (err) { setActionError(describeError(err)); }
    finally { setWorking(false); }
  }
  const section = pathname === '/judge/evidence' ? 'evidence' : pathname === '/judge/agent' ? 'agent' : pathname === '/judge/guide' ? 'guide' : 'overview';
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="bg-ink text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-wrap justify-between items-center gap-4">
          <Link className="text-2xl font-bold" to="/">AgentWallet <span className="text-mint">v2</span></Link>
          <span className="text-sm">Ethereum Sepolia · chain 11155111 · read-only</span>
          <nav aria-label="Judge navigation" className="w-full flex flex-wrap gap-2">
            {nav.map(([to, label]) => <Link key={to} to={to} className={`rounded-full px-4 py-2 text-sm ${pathname === to ? 'bg-white text-ink' : 'bg-white/10 hover:bg-white/20'}`}>{label}</Link>)}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <Alert title="Public competition demonstration">No wallet or testnet funds required. This website cannot sign, approve, unpause, or spend. Historical transactions are labeled separately from current chain reads.</Alert>
        {error && <Alert variant="error" title="Backend unavailable">{error}. Please retry; the deployment may be waking up. <a href="https://sepolia.etherscan.io/address/0x3C9389E704331B8a12381F9ab5A68a7F3F59582F" {...ext}>View the public contract directly.</a></Alert>}
        {loading && <p role="status" aria-live="polite">{attempt === 1 ? 'Loading public evidence…' : `Waking the free backend — retry ${attempt} of 6…`} First visits after inactivity can take about a minute; please keep this page open. Only reads retry automatically.</p>}
        <div className="flex flex-wrap gap-3 items-center"><Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>{loading ? 'Reading…' : error ? 'Retry connection' : 'Refresh chain state'}</Button><span className="text-xs text-slate-500">Reads are cached for up to 15 seconds.</span></div>
        {data && <>
          {data.live.status !== 'ok' && <Alert variant="warning" title="Current chain state unavailable">{data.live.message}</Alert>}
          {data.live.status === 'ok' && !data.live.safeStopped && <Alert variant="error" title="Contract state changed">The contract no longer matches the expected paused and revoked state. Operator actions remain disabled on this website.</Alert>}
          {section === 'overview' && <>
            <div className="max-w-3xl space-y-4"><p className="text-xs font-mono uppercase text-slate-500">FinTechathon · verified testnet evidence</p><h1 className="text-4xl sm:text-6xl leading-tight">The AI plans.<br/>The owner authorizes.<br/>The contract enforces.</h1><p className="text-slate-600 text-lg">Explore an AI-assisted treasury with spending caps, owner signatures, bounded task grants, and an auditable execution history.</p></div>
            <Card><CardHeader title="Public v2 contract" subtitle="Live read-only RPC state"/><CardContent className="space-y-3">
              <a className="font-mono break-all underline" href={data.explorerUrl} {...ext}>{data.contractAddress}</a>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-5 text-sm">
                <div><dt>Paused</dt><dd className="font-bold">{data.live.status === 'ok' ? String(data.live.paused) : 'Unknown'}</dd></div>
                <div><dt>Agent revoked</dt><dd className="font-bold">{data.live.status === 'ok' ? String(data.live.agent === '0x0000000000000000000000000000000000000000') : 'Unknown'}</dd></div>
                <div><dt>Contract balance</dt><dd className="font-bold">{data.live.status === 'ok' ? data.live.balanceEth + ' test ETH' : 'Unknown'}</dd></div>
                <div><dt>Read at block</dt><dd className="font-mono">{data.live.blockNumber ?? 'Unavailable'}</dd></div>
              </dl><p className="text-xs text-slate-500">Last read: {data.live.checkedAt}. The website never changes this state.</p>
            </CardContent></Card>
            <div className="grid md:grid-cols-3 gap-4">{[
              ['Owner-approved payment', 'Historical transaction: an AI draft required an EIP-712 owner signature verified on-chain.'],
              ['Bounded autonomy', 'Historical transaction: a scheduler payment stayed within an owner-signed grant.'],
              ['Emergency controls', 'Historical evidence shows grant revocation, pause, emergency stop and final withdrawal.'],
            ].map(([title, text]) => <Card key={title}><CardHeader title={title}/><CardContent><p className="text-sm text-slate-600">{text}</p></CardContent></Card>)}</div>
            <Link className="inline-block underline font-semibold" to="/judge/evidence">Inspect the 12 historical Sepolia transactions →</Link>
          </>}
          {section === 'evidence' && <>
            <h1 className="text-4xl">On-chain evidence</h1><p>{data.historical.source}. Collected {data.historical.collectedAt}.</p>
            <Card><CardContent className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Step</th><th className="p-2">Receipt</th><th className="p-2">Block</th><th className="p-2">Test ETH</th><th className="p-2">Transaction</th></tr></thead><tbody>
              {data.historical.transactions.map((t) => <tr className="border-t" key={t.hash}><td className="p-2 min-w-40">{t.label}</td><td className="p-2">{t.status === 1 ? 'SUCCESS (historical)' : 'REVERTED (historical)'}</td><td className="p-2">{t.block}</td><td className="p-2">{t.valueEth}</td><td className="p-2"><a className="underline font-mono" title={t.hash} href={t.explorerUrl} {...ext}>{t.hash.slice(0, 12)}…{t.hash.slice(-6)}</a></td></tr>)}
            </tbody></table></CardContent></Card>
            <Card><CardHeader title="Security verification" subtitle={`Historical read-only checks · ${data.historical.verification.verifiedAt}`}/><CardContent>
              <p className="font-bold mb-3">{data.historical.verification.checks.filter((c) => c.pass).length}/{data.historical.verification.checks.length} checks passed in the recorded verification.</p>
              <ul className="space-y-2 text-sm">{data.historical.verification.checks.map((c) => <li key={c.label}>{c.pass ? '✓' : '✗'} {c.label}</li>)}</ul>
            </CardContent></Card>
            <ul className="space-y-2">{data.historical.sources.map((s) => <li key={s.url}><a className="underline" href={s.url} {...ext}>{s.title} ↗</a></li>)}</ul>
            <Alert variant="warning">{data.historical.limitations.join(' ')}</Alert>
          </>}
          {section === 'agent' && <>
            <h1 className="text-4xl">AI & risk analysis</h1>
            <p>Try the deterministic policy engine without a wallet. It reads the real contract and explains why execution is blocked. Live AI, when enabled by the team, can explain evidence and request the same read-only assessment.</p>
            <Card><CardHeader title="Read-only transfer assessment" subtitle="This form creates no proposal, signature or transaction."/><CardContent>
              <form className="grid sm:grid-cols-2 gap-4" onSubmit={assess}>
                <label className="text-sm">Amount (ETH)<input required className={field} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"/></label>
                <label className="text-sm">Recipient address<input required className={field} value={recipient || data.recipients[0]?.address || ''} onChange={(e) => setRecipient(e.target.value)} /></label>
                <Button disabled={working} type="submit">Assess transfer risk</Button>
              </form>
              {assessment && <div className="mt-5" aria-live="polite"><p className="font-bold">{assessment.policy.passed ? 'Policy checks passed; website execution remains disabled' : 'Execution blocked by policy'}</p><p className="text-sm">{assessment.note}</p><ul className="mt-3 space-y-2 text-sm">{assessment.policy.checks.map((c) => <li key={c.id}>{c.passed ? '✓' : '✗'} {c.id}: {c.message}</li>)}</ul></div>}
            </CardContent></Card>
            <Card><CardHeader title="AI evidence assistant" subtitle={data.ai.enabled ? `${data.ai.provider} · ${data.ai.model} · read-only tools` : 'Live AI unavailable'}/><CardContent className="space-y-3">
              <p className="text-sm">{data.ai.enabled ? 'Only submit public demonstration questions. Your text and public chain context are sent to the configured AI provider. Limits: three requests per IP per hour and a shared daily quota.' : data.ai.reason}</p>
              <form className="space-y-3" onSubmit={analyze}><label className="block text-sm">Question<textarea className={field} maxLength={1200} value={message} onChange={(e) => setMessage(e.target.value)} required disabled={!data.ai.enabled}/></label><Button type="submit" disabled={!data.ai.enabled || working}>{working ? 'Checking…' : 'Ask AI assistant'}</Button></form>
              {analysis && <div aria-live="polite"><p className="font-bold">{analysis.status} · AI-generated explanation</p><p className="whitespace-pre-wrap text-sm">{analysis.text}</p><p className="text-xs mt-2">Trusted policy assessments returned: {analysis.assessments.length}. No transaction was executed.</p>{analysis.usage && <p className="text-xs">Provider usage: {analysis.usage.modelCalls} model calls, {analysis.usage.inputTokens} input tokens, {analysis.usage.outputTokens} output tokens.</p>}</div>}
            </CardContent></Card>
            {actionError && <Alert variant="error">{actionError}</Alert>}
          </>}
          {section === 'guide' && <>
            <h1 className="text-4xl">Judge quick start</h1><Card><CardContent><ol className="list-decimal pl-5 space-y-4">
              <li>Open Overview. Confirm Ethereum Sepolia, the public v2 address, and the current paused/revoked status.</li>
              <li>Open On-chain evidence. Follow the owner-approved and autonomous payment links to Sepolia Etherscan. The receipts are historical, real testnet transactions.</li>
              <li>Review the recorded security checks, including replay, grant bounds, revocation, and emergency stop.</li>
              <li>Open AI & risk analysis. Assess 0.0001 ETH to the evidence recipient, then try an amount above the cap. The policy engine reports the real blockers without moving funds.</li>
              <li>If live AI is enabled, ask how owner approval differs from a bounded task grant. AI text is advisory; the deterministic results remain authoritative.</li>
            </ol></CardContent></Card>
            <Alert>Operator flows were exercised locally with MetaMask and in separate public testnet runs using a test-only wallet bridge. Signing, task activation and emergency controls are unavailable on this public website. A funded interactive sandbox requires separate team approval.</Alert>
            <p className="text-sm">No mainnet integration, new transactions, fabricated prices, or simulated transactions presented as real. No USD valuation is shown because this Sepolia deployment has no configured price feeds.</p>
          </>}
        </>}
      </main>
      <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 text-sm text-slate-500">AgentWallet · Ethereum Sepolia only · Public v1/v2 evidence preserved · Testnet funds only</footer>
    </div>
  );
}
