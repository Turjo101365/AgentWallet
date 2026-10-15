# AgentWallet Architecture

Status as of Phase 2 (2026-10-15). For what is verified and what is not, see
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## 1. Principle

AgentWallet separates **who plans**, **who authorizes** and **who can move funds**:

| Role | Holder | Can do | Cannot do |
|---|---|---|---|
| Owner (custodian) | Operator's own wallet (MetaMask). Never seen by the backend. | Set limits, allowlist, agent, pause, withdraw. Approve single transfers (EIP-712). Sign bounded task grants (EIP-712). Loosen policy settings. | — |
| Agent (executor) | Backend credential provider: encrypted keystore, env key, or Hardhat dev key (local only) | Call `executeTransfer` only: allowlisted recipient, enabled asset, per-tx and daily caps, once per intent id | Change any setting, withdraw, become owner |
| LLM planner | Anthropic (`claude-opus-5-5`) or any OpenAI-compatible endpoint | Read tools; draft transfers and tasks; tighten policy; pause automation; cancel tasks | Sign, approve, resume automation, loosen limits, use non-allowlisted addresses, see keys |
| RL timing advisor | Python service with trained PPO/DQN checkpoints | Advise WAIT or EXECUTE_NOW inside an authorized execution window | Choose recipient or amount, skip the deadline, bypass policy |

Security does not depend on either model being correct. Trusted backend code enforces policy,
and the smart contract enforces the hard limits again on-chain.

## 2. Components

```
Browser (React/Vite)
  │  SIWE session · EIP-712 approvals and task grants · owner txs via MetaMask
  ▼
Backend (Express, backend/src)
  ├─ routes/api.js               strict zod schemas, auth, rate limits, idempotency
  ├─ services/agentChatService   LLM tool loop; persists turns, plans, tool calls (agent memory)
  │    └─ llm/providers.js, llm/tools.js   provider abstraction; strict tools bound to services
  ├─ services/schedulerService   tasks, grants, idempotent runs, leases, retries, breakers, recovery
  │    └─ services/timingAdvisor RL execution timing from recorded gas samples
  ├─ services/riskEngine         single entry point: block-pinned snapshot -> policyService checks
  │    ├─ services/policyService  pure checks + approval routing + decision explanations
  │    ├─ services/policySettings owner settings (stricter-only from the agent)
  │    └─ services/priceService   Chainlink-compatible feeds, staleness, sources
  ├─ services/proposalService    proposal state machine; owner approval; grant approval
  ├─ services/executorService    limited-authority executor (simulate, sign, persist, broadcast, verify)
  │    └─ services/signerProvider the only module that touches key material
  ├─ services/portfolioService   valuation, allocation, exposure, analytics, snapshots, suggestions
  ├─ services/indexerService     contract event indexer
  └─ repositories/ (index.js, autonomy.js)   SQL + mappers; compare-and-set transitions
  │
  ├──▶ RL timing service (FastAPI, rl-engine/)   trained checkpoints or "unavailable"
  ├──▶ LLM provider (HTTPS)                      optional
  └──▶ EVM JSON-RPC (Hardhat 31337 or Base Sepolia 84532) ─ AgentWallet.sol, price feeds
```

## 3. Paths to a transfer

All three paths create the same kind of proposal and go through the same `riskEngine.assessTransfer`.

| Path | Created by | Approved by |
|---|---|---|
| Manual | Owner (Proposals page or API) | Owner EIP-712 signature |
| Agent | LLM `propose_transfer` tool, on the owner's session | Owner EIP-712 signature |
| Task run | Scheduler, from an owner-signed task grant | The grant, *only if* it is within grant bounds **and** under the owner's auto-approval limit; otherwise the owner (escalation) |

```
riskEngine: snapshot(block N) + allowlist + reservations + settings + prices
  -> checks: AUTOMATION_ACTIVE (tasks), AGENT_ACTIVE, CONTRACT_ACTIVE, EXECUTOR_AUTHORIZED,
             TOKEN_SUPPORTED, RECIPIENT_VALID, RECIPIENT_ALLOWLISTED, RECIPIENT_TYPE, AMOUNT_POSITIVE,
             PER_TX_LIMIT, DAILY_LIMIT, BALANCE_AND_RESERVE, USD_DAILY_LIMIT, GAS_PRICE, EXECUTOR_GAS
  -> SIMULATION (staticCall + estimateGas from the executor)
  -> explanation { outcome: REJECTED | DEFERRED | ESCALATED | AUTO_APPROVED | ALLOWED_PENDING_APPROVAL, headline, blockedBy }
```

The assessment runs at creation, again at approval (owner or grant), and again in executor pre-flight.

## 4. Autonomous tasks

```
create (PENDING_AUTHORIZATION) ──owner signs AuthorizeTask{taskId, token, recipient, amountPerRun,
                                 maxRuns, maxTotal, validUntil, scheduleHash, executionWindowSeconds}──▶ ACTIVE
scheduler tick (every SCHEDULER_TICK_MS):
  lease due tasks (UPDATE ... WHERE lease free)  ─▶ task_run(run_key = taskId:occurrence)  ─▶ advance schedule
  per open run: [RL timing may DEFER inside the window] ─▶ claim (CAS on status+attempt)
     ─▶ reserve grant bounds (atomic) ─▶ proposal (risk engine) ─▶ routeApproval
         AUTO_GRANT ─▶ approveByGrant (risk re-check) ─▶ executor ─▶ receipt ─▶ CONFIRMED
         ESCALATE   ─▶ owner approves in console     ─▶ executor ─▶ CONFIRMED
     failures: transient -> RETRY_WAIT (exponential backoff, bounded attempts); otherwise FAILED
  circuit breakers: N consecutive failed runs -> task PAUSED;
                    rolling-hour autonomous outflow over cap -> escalate + pause automation
```

**Double execution is prevented at five levels:**
- task lease;
- `run_key` uniqueness;
- the claim compare-and-set;
- one proposal per run attempt, plus the proposal state machine;
- the contract's `executedIntents`.

**Recovery:** expired leases are re-acquired. Runs left `CLAIMED` by a crashed process are linked to their proposal or retried, with the grant reservation released. The executor resumes approved and submitted transactions.

**Kinds:**
- `ONE_TIME` (`once`);
- `RECURRING` (`interval`, `weekly` UTC); missed occurrences are skipped, not caught up;
- `CONDITIONAL` (`gas_below_gwei`, `balance_above`): checked every `CONDITION_CHECK_SECONDS` until met or expired.

## 5. LLM agent

- **Loop:** a manual tool loop, at most `LLM_MAX_MODEL_CALLS` per turn.
- **Before running any tool**, the loop checks `stop_reason` (`refusal` → `REFUSED`; `max_tokens` → `FAILED`, no tools run).
- **Tools** have strict JSON schemas (`additionalProperties: false`, all fields required, nullable where optional) and are validated again with zod before running.
- **Action tools** require `record_plan` first in the turn.
- **Recipients** must come from the on-chain allowlist (checked in code); an invented address is rejected.
- **Untrusted data:** tool results, labels and memos are passed as data; the system prompt says so. The real defence is that no tool can move money without owner approval or a signed grant.
- **Anthropic:**
  - official SDK, `client.beta.messages.create`, `claude-opus-5-5`, `output_config.effort: "medium"`;
  - server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`);
  - raw assistant content (including thinking blocks) is replayed unchanged (append-only history).
- **OpenAI-compatible:** `/chat/completions` with function tools, for local models.
- **Memory:** `conversations`, `agent_turns` (plan, final text, actions, usage, model calls), `conversation_messages` (provider-format replay) and `tool_invocations` (input, output, status, error).

## 6. RL execution timing

- **Task:** given an authorized payment with a window of W steps (15-minute steps), choose WAIT or EXECUTE.
- **Reward:** `-(gas_exec / gas_window_start)` on execution, minus a small per-step delay cost. Spending is never rewarded: every episode settles exactly one payment.
- **Data:** a synthetic gas process (mean-reverting noise + diurnal cycle + decaying spikes). Features are scale-free ratios, so the same model applies to chains with very different absolute fees.
- **Training:** SB3 PPO and DQN. Checkpoints are selected on validation seeds (500 000+) and reported on disjoint test seeds (1 000 000+), with baselines (execute immediately, a 10% threshold rule, a hindsight oracle) and bootstrap confidence intervals.
- **Serving:** the registry loads `models/<algo>/best_model.zip` + `metadata.json`, runs a health-check inference and reports `available` or `unavailable` with the reason. There is no heuristic substitute.
- **Integration:** the backend samples gas each tick (`GAS_SAMPLE_INTERVAL_SECONDS`) and asks for advice per run. WAIT defers inside the window; the deadline forces execution deterministically. If the service or model is unavailable, the run executes at once and records why.

## 7. Portfolio

- **Balances and limits:** on-chain, block-pinned.
- **USD values:** only from configured AggregatorV3 feeds. Each carries its source, round time and a staleness flag; there is no fallback estimate. Local feeds are deployed mocks labelled synthetic.
- **Allocation and targets:** drift is advisory. AgentWallet has no swap integration, so it never claims to rebalance.
- **Exposure:** largest weight, agent daily capacity in USD, executor gas runway, stale prices.
- **Analytics:** from indexed events (by day, token, recipient, category). History comes from periodic balance snapshots.

## 8. Persistence

- **Migrations:** `001_initial_schema.sql` and `002_autonomy.sql`, applied at start-up.
- **Engines:** PostgreSQL (`DATABASE_URL`) or PGlite on disk.
- **Restart-safe state:** tasks, runs, leases, grants, conversations, tool calls, gas samples, snapshots, settings and the hash-chained audit log all persist.

## 9. Deliberate non-choices

- **No upgradeable proxy:** an admin key could replace the limit logic.
- **No server-side owner key:** owner actions are user-signed.
- **No swaps or DEX routing:** out of scope; drift is reported, not traded.
- **The LLM cannot loosen anything or resume automation:** those actions need the owner in the console.
