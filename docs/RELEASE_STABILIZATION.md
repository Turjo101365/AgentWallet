# Competition release stabilization — 18 October 2026

## Decision

**GO for review of the local stabilization patch. No deployment or replacement
invite is authorized. Public payment verification remains NO-GO until separate
deployment, invite and payment approvals.** Changes are local and uncommitted.

## Incident evidence and limits

Times below are Asia/Dhaka (UTC+6).

- Audit #58: controlled one-session invite created at 13:56:55; expiry 14:56:55.
  Database lifetime was 3599.891 seconds, consistent with one hour.
- Audit #59: one session was successfully created at 13:59:17–18. The invite's
  `sessions_used` became 1 of 1. This explains a subsequent `INVITE_INVALID`.
- Audit #60: the human administrator revoked the exposed invite at 14:03:05–06.
  Its linked session now has `execution_allowed=false`; it made zero payments.
- No Treasury obligations exist. Execution is disabled and all six spending/gas
  ceilings remain zero. These were independently read back during stabilization.
- Failed admission requests are not audit events, and the Render log queries
  returned no matching session-request/CORS entries. There is insufficient evidence
  to determine whether the original successful request was followed by a duplicate,
  lost response, UI failure or entry from another holder of the exposed code.
  Do not claim that a historical duplicate or CORS cause was proven.
- Current production-origin CORS preflight returned 204 with the exact allowed
  origin; an untrusted origin returned 403. This does not prove historical behavior.

## Source findings

`React.StrictMode` is enabled. It can repeat effect setup/configuration GETs; the
session-creation POST was called only by the explicit Welcome submit handler.
There is no automatic fetch retry in that path and no session POST in a mount
effect. The previous UI depended on React busy state/button disabling, without a
synchronous handler guard or provider guard against concurrent callers.

Backend admission previously consumed the invite, inserted its session and appended
the audit in separate transactions. A later failure could consume an invite without
returning a usable session. In this incident both the session and audit succeeded;
that partial-commit failure is a demonstrated code weakness, not the proven cause
of this specific browser failure.

## Minimal changes and priority

| Change | Classification | Scope |
|---|---|---|
| Synchronous Welcome guard and shared in-flight provider promise | Competition blocker | Prevent overlapping entry calls from issuing multiple POSTs |
| Restore and server-verify a stored response for the same invite; preserve normal reload/config retry | Competition blocker | Existing bearer authentication only; no second invite consumption |
| Warn against resubmission when a creation response cannot be read | Competition blocker | No automatic POST retries or invented success |
| Commit invite consumption, session and hash-linked audit together | Competition blocker | Existing database transaction/advisory audit lock; no schema change |
| Show Administration/Evidence navigation in Admin mode and contextual admin-console badge | Competition blocker | Removes misleading links; no privilege granted by UI selection |
| Show effective protected reserve separately from server minimum; save confirmation | Competition blocker | Existing authenticated read response includes effective reserve; policy enforcement unchanged |
| New recovery/authentication protocol, automatic invite replacement, redesign, bundle optimization | Optional polish / broader work — deferred | No implementation |

Security invariants retained: SIWE, server admin allowlist, one-use/max-session
validation, expiry/revocation, existing opaque bearer validation, session-scoped
obligations, explicit payment confirmation, EIP-712 authorization, execution switches,
spending/gas ceilings, durable gates and unchanged contracts.

Recovery has a deliberate limit: a saved successful response can be restored. If
the response was lost before the browser received its bearer token, the client
cannot recover it from an invite alone. Stop, inspect/revoke through authenticated
admin controls, then seek separate approval for a replacement. No new authentication
mechanism or server-side plaintext token store was introduced.

## Exact verification

| Verification | Result |
|---|---|
| New backend admission regressions on isolated PGlite | 7/7 passed |
| Same admission tests on isolated loopback PostgreSQL | 7/7 passed |
| Existing demo/admin/personal-wallet local-chain suite | 15/15 passed |
| Focused frontend entry/Admin/Treasury tests | 22/22 passed |
| Production frontend build with judge mode and HTTPS API | Passed; existing large-chunk warning, 662.26 kB JS |
| Changed backend JavaScript syntax checks | Passed |
| `git diff --check` | Passed |

Regression coverage includes one-use and concurrent admission, rollback after
session/audit failure, expiry/revocation, audit-chain integrity, bearer recovery
after database restart, StrictMode/duplicate submissions, full frontend remount,
GET-only configuration retry, verified cached-session recovery, rejection of forged
or expired cached credentials, revoked-session read-only eligibility, and honest
handling of a lost response. Admin tests cover denied access, effective reserve vs
minimum, successful saves and rejected saves. Existing local-chain tests retain
real local transaction coverage; no new public-chain execution is claimed.

The PostgreSQL fixture used the existing isolated local server/database and a new
test schema; production Neon was read-only. The local PostgreSQL server was stopped
after verification. No hosted service, secret, limit, invite or contract was changed.

## Minimum approved-next sequence

1. Review patch, then obtain approval to publish/deploy the same application with
   all execution switches off and zero budgets. No migration is required.
2. Verify hosted authentication, Admin reserve display/navigation and unchanged
   execution safeguards. Inspect browser Network while testing entry after a
   separately approved fresh private one-hour/single-session invite.
3. Preserve the successfully returned session; do not re-enter the used code.
   Create both approved obligations in that same invited session while payments
   remain disabled. No autonomous grant is needed.
4. Obtain separate confirmation before temporary one-payment ceilings and the
   exact 0.0001 ETH Sepolia payment, maximum gas 0.000001 ETH. Require the human's
   in-application confirmation; then verify two confirmations and matching event.
5. Disable/revoke/restore zero limits, verify reserve-specific rejection of B and
   preserve receipt, policy and audit evidence. Do not label this step completed yet.

Rollback retains migration 006, reserve 0.0003 ETH and all audit/financial records.
Revert application code only with execution disabled and zero ceilings; never
reset invite usage or delete session/audit evidence to recover an entry attempt.
