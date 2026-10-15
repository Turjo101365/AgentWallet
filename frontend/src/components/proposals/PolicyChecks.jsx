import React from 'react';

/** The exact checks the backend policy engine ran, pass or fail, as returned by the API. */
export function PolicyChecks({ result }) {
  if (!result?.checks?.length) return null;
  return (
    <ul className="space-y-1.5 text-xs">
      {result.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2">
          <span className={`material-symbols-outlined text-base ${c.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
            {c.passed ? 'check_circle' : 'cancel'}
          </span>
          <span>
            <span className="font-mono font-semibold text-slate-700">{c.id}</span>
            <span className="text-slate-500"> — {c.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
