import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useApp } from '../app/providers.jsx';
import { get, post, describeError } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';

const EXAMPLES = [
  'Send 0.005 ETH to my approved supplier.',
  'Pay my supplier 0.002 ETH every Monday at 09:00 UTC for 8 weeks.',
  'Show my portfolio and recent spending.',
  'Keep at least 0.02 ETH available for gas.',
  'Stop all automated payments.',
  'Transfer 10 mUSDC to my contractor, but never exceed my daily limit.',
];

const STATUS_VARIANT = { COMPLETED: 'success', NEEDS_CLARIFICATION: 'warning', FAILED: 'error', REFUSED: 'error', UNAVAILABLE: 'error', RUNNING: 'warning' };
const TOOL_VARIANT = { OK: 'success', REJECTED: 'warning', ERROR: 'error' };

function ToolCall({ inv }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-lg text-xs">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="font-mono font-semibold text-slate-700">{inv.tool}</span>
        <span className="flex items-center gap-2">
          {inv.error && <span className="text-slate-500 truncate max-w-[280px]">{inv.error}</span>}
          <Badge variant={TOOL_VARIANT[inv.status] || 'neutral'}>{inv.status}</Badge>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 font-mono">
          <div><div className="text-slate-400 uppercase text-[10px]">input</div><pre className="bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(inv.input, null, 2)}</pre></div>
          <div><div className="text-slate-400 uppercase text-[10px]">output</div><pre className="bg-slate-50 rounded p-2 overflow-x-auto max-h-64">{JSON.stringify(inv.output, null, 2)}</pre></div>
        </div>
      )}
    </div>
  );
}

function ActionLink({ a }) {
  if (a.type === 'proposal') return <Link className="underline" to="/proposals">Proposal {a.id.slice(0, 8)} · {a.status}</Link>;
  if (a.type === 'task') return <Link className="underline" to="/automation">Task {a.id.slice(0, 8)} · {a.status}</Link>;
  if (a.type === 'rejected') return <span className="text-amber-800">Rejected by trusted code: {a.reason}</span>;
  if (a.type === 'automation') return <span>Automation paused</span>;
  if (a.type === 'policy') return <Link className="underline" to="/controls">Policy updated ({a.key})</Link>;
  return <span>{a.type}</span>;
}

function Turn({ turn }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">{turn.userMessage}</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 space-y-3 max-w-[92%]">
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <Badge variant={STATUS_VARIANT[turn.status] || 'neutral'}>{turn.status}</Badge>
          <span>{turn.provider} {turn.model ? `· ${turn.model}` : ''} · {turn.modelCalls} model call{turn.modelCalls === 1 ? '' : 's'}</span>
        </div>
        {turn.plan && (
          <div className="text-xs">
            <div className="font-semibold text-slate-700 mb-1">Plan: {turn.plan.goal}</div>
            <ol className="list-decimal pl-5 space-y-0.5 text-slate-600">
              {turn.plan.steps.map((s, i) => <li key={i}>{s.description} <span className="font-mono text-slate-400">({s.tool})</span></li>)}
            </ol>
          </div>
        )}
        {turn.toolInvocations?.length > 0 && <div className="space-y-1.5">{turn.toolInvocations.map((inv) => <ToolCall key={inv.id} inv={inv} />)}</div>}
        {turn.finalText && <div className="text-sm text-slate-800 whitespace-pre-wrap">{turn.finalText}</div>}
        {turn.error && <Alert variant="error">{turn.error}</Alert>}
        {turn.actions?.length > 0 && (
          <div className="text-xs space-y-1 border-t border-slate-100 pt-2">
            <div className="font-semibold text-slate-500 uppercase text-[10px]">Resulting actions</div>
            {turn.actions.map((a, i) => <div key={i}><ActionLink a={a} /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function Agent() {
  const { isOwner } = useApp();
  const status = usePolling(() => get('/agent/status'), 15000);
  const list = usePolling(() => get('/agent/conversations'), 0, [], { enabled: isOwner });
  const [conversationId, setConversationId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottom = useRef(null);
  const llm = status.data?.llm;

  async function load(id) {
    setConversationId(id);
    setConversation(id ? await get(`/agent/conversations/${id}`) : null);
  }

  useEffect(() => bottom.current?.scrollIntoView?.({ behavior: 'smooth' }), [conversation]);

  async function send(e) {
    e?.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const turn = await post('/agent/chat', { message, conversationId });
      setMessage('');
      await load(turn.conversationId);
      list.refresh();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">AI agent</h1>
        <p className="text-sm text-slate-500 mt-1">
          The language model plans and calls tools. It cannot sign or approve: transfers wait for your approval, schedules wait for your signed grant, and every action passes the policy engine and the contract limits.
        </p>
      </div>
      {llm && !llm.available && (
        <Alert variant="warning" title="No language model configured">
          {llm.reason}. The rest of the console works without it. Set ANTHROPIC_API_KEY (or an OpenAI-compatible endpoint) in backend/.env and restart the backend.
        </Alert>
      )}
      {!isOwner && <Alert variant="warning">Only the contract owner can use the agent.</Alert>}
      <div className="grid lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader title="Conversations" action={<Button size="sm" variant="secondary" onClick={() => load(null)}>New</Button>} />
          <CardContent className="space-y-1 text-xs">
            {list.data?.map((c) => (
              <button key={c.id} onClick={() => load(c.id)} className={`block w-full text-left px-2 py-1.5 rounded ${c.id === conversationId ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}>{c.title}</button>
            ))}
            {list.data?.length === 0 && <div className="text-slate-400">No conversations yet.</div>}
            <div className="pt-3 text-[11px] text-slate-400">
              Model: {llm ? (llm.available ? `${llm.provider} · ${llm.model}` : 'unavailable') : '…'}
            </div>
          </CardContent>
        </Card>
        <div className="lg:col-span-3 space-y-4">
          <div className="space-y-5 min-h-[200px]">
            {conversation?.turns.map((t) => <Turn key={t.id} turn={t} />)}
            {!conversation && (
              <div className="grid sm:grid-cols-2 gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setMessage(ex)} className="text-left text-xs bg-white border border-slate-200 rounded-lg p-3 hover:border-primary">{ex}</button>
                ))}
              </div>
            )}
            <div ref={bottom} />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <form onSubmit={send} className="flex gap-2">
            <textarea
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              value={message}
              maxLength={4000}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
              placeholder="Ask the agent…"
              disabled={!isOwner || busy}
            />
            <Button type="submit" disabled={!isOwner || busy || !message.trim()} icon="send">{busy ? 'Thinking…' : 'Send'}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
