# Safety and Authorization Model

An operator-facing summary. Details: [ARCHITECTURE.md](ARCHITECTURE.md); findings: [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md).

## Layers (each one independently blocks a bad transfer)

1. **Input validation.** Strict schemas; checksummed addresses; integer base units; unknown fields rejected.
2. **Authentication.** EIP-4361 wallet sign-in, single-use nonces, revocable hashed sessions.
3. **Authorization.** Owner-only actions require the session address to equal the contract's
   on-chain `owner()`, read live and failing closed.
4. **Policy engine (trusted code).** Checks run against chain state pinned to one block:
   - off-chain pause;
   - on-chain pause;
   - the executor being the on-chain agent;
   - token enabled;
   - recipient valid and allowlisted;
   - per-tx cap;
   - daily cap including in-flight reservations;
   - balance + reserve floor;
   - gas price cap;
   - executor gas balance;
   - a static-call simulation.
5. **Human approval.** An EIP-712 signature by the owner over the exact proposal, intent, token,
   recipient, amount and deadline. Policy and simulation are re-run at approval.
6. **Idempotent, single execution.** Atomic status transitions, Idempotency-Key, one execution row
   per proposal, and the hash persisted before broadcast.
7. **Smart contract.** The agent key can only call `executeTransfer`: allowlisted recipients,
   enabled assets, per-tx and daily caps, each intent once, and only while not paused.
8. **Verification and audit.** CONFIRMED only after a verified receipt; append-only, hash-chained audit log.

## What each actor can do if compromised

| Compromised | Worst case | Bound |
|---|---|---|
| RL engine / future LLM | Suggests bad actions | Cannot choose recipients or bypass policy; every transfer still needs the owner signature |
| Frontend | Shows wrong data or requests signatures | The owner's wallet displays the EIP-712 fields being signed; the backend re-checks policy |
| Backend (incl. agent key) | Sends agent transfers without approval | Only to allowlisted recipients, within on-chain caps; the owner can `emergencyStop` at any time |
| Owner key | Full custody | Out of scope: protect it with a hardware wallet or multisig |

## Emergency procedure
1. **Risk controls → Emergency stop.** One owner transaction: pauses the contract and revokes the agent.
2. Optionally pause the agent off-chain (stops the backend from creating or executing anything).
3. Use **Treasury → Emergency withdraw** (available while paused) to move funds to cold storage.
4. Review **Audit log** and **Transactions**.
