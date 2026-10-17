import React from 'react';
import { Card, CardHeader, CardContent, PageHeader } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { get } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { truncateAddress } from '../utils/formatters.js';
import { auditIcon } from '../lib/events.js';

export function Audit() {
  const log = usePolling(() => get('/audit'), 8000);
  const verify = usePolling(() => get('/audit/verify'), 15000);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Security & transparency" title="Activity log">
        Append-only and hash-chained. The database rejects updates and deletes.
      </PageHeader>
      <Card>
        <CardHeader
          title="Activity record integrity"
          subtitle="Checks that recorded activity has not been altered. Technical hashes remain available below."
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
        <CardContent className="pt-4 overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-12 gap-3 px-3 pb-2 eyebrow text-slate-500">
              <span className="col-span-1">#</span>
              <span className="col-span-3">Time</span>
              <span className="col-span-3">Action</span>
              <span className="col-span-2">Actor</span>
              <span className="col-span-3">Hash (links to previous)</span>
            </div>
            {log.data?.map((e) => (
              <div key={e.id} className="grid grid-cols-12 gap-3 px-3 py-2.5 rounded-2xl text-xs font-mono hover:bg-slate-50 transition-colors items-center">
                <span className="col-span-1 text-slate-500">#{e.id}</span>
                <span className="col-span-3 text-slate-600">{new Date(e.occurredAt).toLocaleString()}</span>
                <span className="col-span-3 font-semibold text-ink flex items-center gap-2">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-slate-500">{auditIcon(e.action)}</span>
                  {e.action}
                </span>
                <span className="col-span-2 text-slate-600" title={e.actor}>
                  {e.actor.startsWith('0x') ? truncateAddress(e.actor) : e.actor}
                </span>
                <span className="col-span-3 text-slate-500 truncate" title={`${e.hash} ← ${e.prevHash || 'genesis'}`}>
                  {e.hash.slice(0, 16)}…
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
