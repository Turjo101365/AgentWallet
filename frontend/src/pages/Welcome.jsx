import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/providers.jsx';
import { Card, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { describeError } from '../lib/api.js';

const field = 'w-full rounded-2xl border border-slate-300 px-4 py-3 bg-white text-[15px] focus:outline-none focus:ring-2 focus:ring-ink';

function Choice({ icon, title, selected, onClick, children, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left rounded-4xl p-6 transition-all w-full ${selected ? 'bg-ink text-white shadow-floating' : 'bg-white text-ink shadow-card hover:-translate-y-0.5 hover:shadow-floating'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className={`material-symbols-outlined text-[28px] ${selected ? 'text-[#9fdcb8]' : 'text-tertiary'}`}>{icon}</span>
        {badge && <span className={`text-[10px] font-mono font-bold uppercase tracking-wider rounded-full px-2.5 py-1 ${selected ? 'bg-white/15' : 'bg-mint text-mint-deep'}`}>{badge}</span>}
      </div>
      <div className="text-[24px] font-display mt-4 leading-tight">{title}</div>
      <div className={`text-[13.5px] mt-2 leading-relaxed ${selected ? 'text-white/75' : 'text-slate-600'}`}>{children}</div>
    </button>
  );
}

/**
 * Entry to the public judge site. No email or password anywhere.
 *  - Judge → Demo Wallet (default): a server-held sandbox, invite-gated for live transactions.
 *  - Judge → My own wallet: MetaMask-compatible wallet, SIWE, the judge's own sandbox.
 *  - Owner/Admin: SIWE, then the server checks its admin allowlist. Choosing it here grants nothing.
 */
export function Welcome() {
  const { startDemo, setMode } = useApp();
  const [role, setRole] = useState('judge');
  const [wallet, setWallet] = useState('demo');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const entering = useRef(false);
  const [error, setError] = useState(null);

  async function enter(e) {
    e?.preventDefault();
    if (entering.current) return;
    setError(null);
    if (role === 'admin') return setMode({ role: 'admin' });
    if (wallet === 'personal') return setMode({ role: 'judge', wallet: 'personal' });
    entering.current = true;
    setBusy(true);
    try {
      await startDemo(invite.trim() || undefined);
    } catch (err) {
      setError(['NETWORK_ERROR','BAD_RESPONSE'].includes(err.code)
        ? 'The session response could not be read. The one-use invite may already have been consumed. Do not submit it again; ask the administrator to check the session audit. No payment has been authorized.'
        : describeError(err));
    } finally {
      entering.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink">
      <header className="px-5 sm:px-8 h-16 flex items-center justify-between text-white">
        <span className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-mint text-ink flex items-center justify-center"><span aria-hidden="true" className="material-symbols-outlined text-[20px]">account_balance_wallet</span></span>
          <span className="font-display text-[22px]">AgentWallet</span>
        </span>
        <Link to="/evidence" className="text-[13px] font-semibold text-white/75 hover:text-white">Historical evidence →</Link>
      </header>
      <div className="sm:px-3 sm:pb-3">
        <div className="bg-canvas rounded-t-[28px] sm:rounded-[32px] min-h-[calc(100vh-4.75rem)] px-4 sm:px-8 py-8 sm:py-12">
          <form onSubmit={enter} className="max-w-6xl mx-auto space-y-10 animate-rise">
            <div className="max-w-3xl">
              <div className="eyebrow text-slate-500 mb-3">FinTechathon · Ethereum Sepolia testnet · no account needed</div>
              <h1 className="text-[44px] sm:text-[72px] leading-[0.95] text-ink">Your money,<br /><span className="text-tertiary">under your control.</span></h1>
              <p className="text-slate-600 mt-5 text-base leading-relaxed max-w-2xl">Tell your AI what you need. Review payments, set spending rules, and track everything in one place. This demo uses Sepolia test ETH, not real money.</p>
            </div>

            <section aria-labelledby="role-heading" className="space-y-4">
              <h2 id="role-heading" className="eyebrow text-slate-500">1 · Who are you?</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Choice icon="gavel" title="Judge" selected={role === 'judge'} onClick={() => setRole('judge')} badge="no sign-up">
                  Explore payments, your AI assistant and security evidence without an account. Use an invite for small live test payments.
                </Choice>
                <Choice icon="admin_panel_settings" title="Owner / Admin" selected={role === 'admin'} onClick={() => setRole('admin')}>
                  Sign in with your approved wallet to manage demo access, spending limits and emergency controls. Your role is verified by the server.
                </Choice>
              </div>
            </section>

            {role === 'judge' && (
              <section aria-labelledby="wallet-heading" className="space-y-4">
                <h2 id="wallet-heading" className="eyebrow text-slate-500">2 · Which wallet?</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <Choice icon="toll" title="Use demo wallet" selected={wallet === 'demo'} onClick={() => setWallet('demo')} badge="default">
                    No MetaMask or test ETH needed. Use shared test funds managed by the team. You confirm a payment; the backend-controlled demo wallet signs it.
                  </Choice>
                  <Choice icon="account_balance_wallet" title="Connect my own wallet" selected={wallet === 'personal'} onClick={() => setWallet('personal')}>
                    Use a MetaMask-compatible wallet on Sepolia and a separate registered sandbox you own. You sign approvals in your wallet. Never share a private key.
                  </Choice>
                </div>
              </section>
            )}

            {role === 'judge' && wallet === 'demo' && (
              <Card>
                <CardContent className="grid lg:grid-cols-[1.2fr_1fr] gap-6 items-end">
                  <div className="space-y-2">
                    <label htmlFor="invite" className="text-[15px] font-bold text-ink">Invite code <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="invite" className={field} value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Needed only for live Sepolia transactions" maxLength={128} />
                    <p className="text-[12.5px] text-slate-500">Without a code you can explore everything and let the AI draft payments; executing them on Sepolia needs the invite code from the team.</p>
                  </div>
                  <Button type="submit" size="lg" disabled={busy} icon="arrow_forward">{busy ? 'Starting demo session…' : invite.trim() ? 'Enter with live transactions' : 'Enter in explore mode'}</Button>
                </CardContent>
              </Card>
            )}
            {(role === 'admin' || wallet === 'personal') && (
              <div className="flex justify-end"><Button type="submit" size="lg" icon="arrow_forward">{role === 'admin' ? 'Continue to admin sign-in' : 'Continue to wallet sign-in'}</Button></div>
            )}
            {error && <Alert variant="error" title="Could not start">{error}</Alert>}

            <div className="grid sm:grid-cols-3 gap-3 text-[13px]">
              {[['history', 'Historical', 'The frozen public v2 run. Evidence section only.'], ['bolt', 'Live', 'Real Sepolia transactions in your sandbox, with receipts.'], ['science', 'Simulated', 'Pre-flight dry runs. No transaction is sent.']].map(([icon, title, text]) => (
                <div key={title} className="rounded-3xl bg-white shadow-card p-4 flex gap-3">
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-tertiary">{icon}</span>
                  <div><div className="font-bold text-ink">{title}</div><div className="text-slate-600">{text}</div></div>
                </div>
              ))}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
