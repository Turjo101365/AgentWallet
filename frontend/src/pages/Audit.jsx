import React from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { get } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { truncateAddress } from '../utils/formatters.js';

export function Audit() {
  const log = usePolling(() => get('/audit'), 8000);
  const verify = usePolling(() => get('/audit/verify'), 15000);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">Append-only and hash-chained. The database rejects updates and deletes.</p>
      </div>
      <Card>
        <CardHeader
          title="Integrity"
          badge={
            verify.data ? (
              verify.data.valid ? (
                <Badge variant="success">Chain valid · {verify.data.entries} entries</Badge>
              ) : (
                <Badge variant="error">Broken at #{verify.data.brokenAt}</Badge>
              )
            ) : null
          }
        />
        <CardContent className="space-y-1 text-xs font-mono overflow-x-auto">
          {log.data?.map((e) => (
            <div key={e.id} className="grid grid-cols-12 gap-2 py-1.5 border-b border-slate-50 min-w-[640px]">
              <span className="col-span-1 text-slate-400">#{e.id}</span>
              <span className="col-span-3 text-slate-500">{new Date(e.occurredAt).toLocaleString()}</span>
              <span className="col-span-3 font-semibold text-slate-800">{e.action}</span>
              <span className="col-span-2 text-slate-600" title={e.actor}>
                {e.actor.startsWith('0x') ? truncateAddress(e.actor) : e.actor}
              </span>
              <span className="col-span-3 text-slate-400 truncate" title={e.hash}>
                {e.hash.slice(0, 16)}…
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
