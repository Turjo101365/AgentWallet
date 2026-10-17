# Interactive judge demo — implementation and approval gate

## Status

The interactive judge application is deployed at https://agentwallet-judge.vercel.app with the existing Render Free backend and Neon PostgreSQL. Runtime release: `62d63df9fd43e2554a970d364893c2dd83dc7257` (PR #7). The separately approved sandbox is `0x59a33154288009e030aa2072De46D32fC7d40d85` on Ethereum Sepolia.
The public evidence contract `0x3C9389E704331B8a12381F9ab5A68a7F3F59582F` remains outside the execution paths.
Its evidence files, 12 historical successful transactions and 26 recorded checks are preserved under `/evidence`.
Historical records are not represented as transactions from a new judge session.

The new sandbox has v2 owner/agent identities verified, native on-chain limits of 0.0001 ETH/payment and 0.0003 ETH/day, a 0.0005 ETH treasury and initially 0.0015 ETH each for dedicated owner/agent gas. All four operator-approved wallet transactions have successful receipts. The approved recipient was subsequently allowlisted on the NEW sandbox only. Public setup hashes and receipts are recorded in `evidence/interactive-sandbox/setup.json`. The historical contract was separately checked paused with agent revoked.

## Judge journey

1. Open the restored dashboard entry, select Judge and the default Demo Wallet.
2. Without an invite, explore and ask the existing GPT-4.1-mini integration to plan and assess risk. No wallet installation or test ETH is required.
3. With an invite, ask the agent to prepare an ETH payment to an on-chain allowlisted recipient.
4. Review the exact recipient, amount, risk assessment and signature label. Confirm explicitly.
5. The backend's dedicated demo OWNER key signs the exact EIP-712 approval, and its separate AGENT key submits it. The judge did not personally sign EIP-712.
6. Show pending/failed/confirmed states from execution records and verified receipts, with Sepolia explorer links.

Treasury, proposals, AI, automation and audit reuse the original dashboard. Admin emergency controls require SIWE and the server allowlist. Demo automation is a separately confirmed ETH grant: two payments, at most 0.0002 ETH total, 30-second interval, 10-minute validity. Due runs are processed while the automation page is open or via its explicit run button. There is no autonomous background loop.

Personal Wallet requires SIWE, an admin-registered separate v2 contract, current on-chain ownership and the approved agent. The owner supplies genuine EIP-712 signatures. Each personal sandbox uses a separate database schema and treasury; no personal key is collected. Judges need their own Sepolia ETH for their treasury and wallet-signed management transactions. Initial capacity is two active personal sandbox contexts on the single free backend; additional contexts are refused until restart.

## Required approval inputs

### Approval received — 2026-10-17

The operator approved the allocations and limits below. Approved public admin/funding wallet: `0x74B7a41E3f4949315364DAd08e1142b38870825b`. Approved payment recipient: `0xd85cdB676877ccdc8873B63DEf51B456568604F5`. Ethereum Sepolia only.

Fresh dedicated credentials were generated in a Git-ignored, Windows DPAPI CurrentUser-protected deployment-secret store with a restricted file ACL. Public owner: `0x98cd6633Fa95cf4Ff9761CDFFa555D553FcDf680`; public agent: `0x341E8F433A90d776DE1C13D8f9DdE48bB387A7d6`. Neither credential has been installed in the hosted backend yet. No private key was written in plaintext or printed.

Read-only RPC preflight: chain 11155111, funding/owner/agent balances all zero, historical contract paused and agent zero. The compiled contract source has no local modifications. Deployment estimate: 20,478,646 gas; with 20% margin: 24,574,375 gas; quoted maximum fee 0.000000062 gwei, maximum deployment fee 0.00000000152361125 ETH. This is a point-in-time quote, excludes configuration/funding transactions and must be refreshed before signing. No transaction has been broadcast. Funding and wallet signing remain required.

- Public admin wallet address(es) for `ADMIN_ADDRESSES`. A UI role choice grants no authority.
- One or more public recipient addresses for the NEW sandbox allowlist. Use team-controlled test recipients; no arbitrary withdrawals.
- Permission to deploy one new instance of the existing v2 bytecode on Ethereum Sepolia (chain 11155111), configure it and fund it as below. No existing evidence contract is reconfigured.
- Two NEW dedicated backend secrets: `DEMO_OWNER_PRIVATE_KEY` and `DEMO_AGENT_PRIVATE_KEY`. Distinct keys; never reuse historical owner/deployer keys or public Hardhat keys. Enter only in Render's secret settings.
- An external deployment wallet controlled by the operator. It pays deployment/configuration gas; its key is not required by the server.
- Existing backend secrets remain: `DATABASE_URL`, `RPC_URL`, `LLM_API_KEY`. Never use `VITE_` variables for secrets.

## Proposed Sepolia funding — test ETH only, approval required

| Destination | Proposed funding/reservation | Purpose |
|---|---:|---|
| New sandbox treasury | 0.0005 ETH | Up to 0.0003 ETH of demo payments above the 0.0002 ETH reserve |
| New agent account | 0.0015 ETH | Transaction relay gas; preserve at least 0.0005 ETH |
| New owner account | 0.0015 ETH | Bounded management/revocation gas; no payment-signing gas |
| External deployment wallet | Up to 0.0200 ETH budget | Deployment, allowlist configuration and verification; estimate before each broadcast |
| **Total allocation ceiling** | **0.0235 ETH** | Not an estimated cost; unused allocations remain unspent |

If actual deployment/configuration estimates exceed 0.0200 ETH, stop and request approval. Gas prices are not guaranteed. There are no automatic top-ups. Repeated runs eventually reach the reserve floor even on a later UTC day; replenishment needs a separate decision.

Constructor: `AgentWallet(newDemoOwner, newDemoAgent, 100000000000000, 300000000000000)` (0.0001 ETH per transaction / 0.0003 ETH per UTC day). Owner calls `setRecipient(address,true)` only for approved recipients. No ERC-20 policy, swap router or price feed is needed for this minimal ETH journey. Confirm `VERSION()==2`, owner, agent, chain ID, allowlist, native policy, balance and pause state before enabling invites. The NEW sandbox must be active; the historical evidence contract must stay paused and revoked.

Write a NEW `contracts/deployments/sepolia-demo.json` containing actual chainId, contractAddress, contractVersion, deployBlock, owner, agent, native ETH token descriptor and approved demoRecipients. Do not invent addresses or overwrite `sepolia-v2-full.json`. Example settings are in `.env.demo.example`; it intentionally leaves `DEMO_ENABLED=false` and has no keys.

## Limits and trust boundary

- Root `APP_MODE=judge`, `BACKGROUND_JOBS=false`, `ALLOW_PUBLIC_TESTNET_EXECUTION=false`; the isolated sandbox is the only configured execution context.
- Demo limit: 3 transactions/session and 3/day globally, each <=0.0001 ETH, total <=0.0003 ETH/day. Confirming a two-run grant reserves both payments up front.
- Relay gas: conservative maximum-fee reservations <=0.0001 ETH/transaction, <=0.0003 ETH/subject/day and <=0.001 ETH/day globally. Global relay counts include personal wallets. Personal subjects are wallet addresses; demo subjects are session IDs.
- Maximum gas price 20 gwei; treasury floor 0.0002 ETH; agent gas floor 0.0005 ETH. Fee ceilings can block execution during expensive periods.
- Persistent SQL reservations and a shared relay gate prevent concurrent signatures with conflicting nonces/budgets. Ambiguous broadcast outcomes keep the gate closed until a receipt is resolved. Do not clear it without investigating the recorded hash and nonce. Failed attempts may consume quota conservatively.
- Invite codes are hashed in storage; admin-created codes are shown once. Revocation stops future authorizations/runs; an already submitted transaction cannot be recalled. Session tokens are bearer credentials; use a fresh private browser session for each judge and sign out afterwards.
- Admins can tighten limits, stop execution, revoke invites and request on-chain pause/emergency stop. The execution switch also blocks personal relay submissions. It cannot cancel an already broadcast transaction.
- AI cannot sign, broadcast, change policies or schedule grants through a tool call. Read tools, plans and draft proposals only; bounded automation is a separate explicit confirmation. Shared daily SQL AI quota, per-IP rate limits, one in-flight request, output/context limits and provider timeout apply.
- The existing v2 OWNER key has full contract authority. Route restrictions are not cryptographic restrictions on a stolen key. A compromised backend could bypass off-chain limits or control this small test treasury. This is a custodial TESTNET demo with deliberately tiny funding, not a production custody design.
- Owner-signed management transactions have a per-transaction fee cap and the small dedicated owner balance; the relay daily gas budget covers payment relays, not admin emergency transactions. No judge route exposes arbitrary owner calls.

## Deployment steps AFTER explicit sandbox approval

1. Keep Vercel Hobby, Render Free (one instance) and Neon Free. Do not add resources, paid plans or a payment method.
2. Generate dedicated keys securely, record only public addresses, estimate and deploy/configure/fund the new contract within the approved limits. Retain hashes and receipts separately from historical evidence.
3. Add the actual new deployment descriptor and required Render secret values. Retain strict existing frontend HTTPS origin/CORS and existing OpenAI model. Do not populate root `AGENT_PRIVATE_KEY` or owner/deployer credentials.
4. Review the local changes, then publish them using the approved Git workflow. Apply migrations 004 and 005 via existing startup migration handling against Neon. Enable `DEMO_ENABLED=true` only when all startup checks succeed.
5. Deploy backend and frontend together. Check readiness, isolated SQL persistence through restart, cold-start retry, mobile entry/dashboard and evidence navigation. Confirm the historical contract is still paused/revoked.
6. SIWE admin checks allowlisted and rejected wallets; issue a single-use invite. Check explore-only execution refusal and quota refusal. Use one approved real GPT-4.1-mini request to create a proposal; explicitly confirm one payment and verify the receipt/event on Sepolia. Do not advertise live sandbox execution before these checks pass.

Rollback: disable demo execution, revoke invites, pause/emergency-stop only the NEW sandbox if needed, then set `DEMO_ENABLED=false` and roll back the code deployment. Preserve Neon schemas, pending transaction hashes, audit records, deployment records and historical evidence. Do not automatically reset budgets or unknown relay claims.

## Focused validation and remaining checks

The backend test file `backend/test/demo.wallet.test.js` exercises actual v2 bytecode on a throwaway local chain, genuine owner EIP-712 signatures, demo confirmation, grant execution/revocation, wrong-session/amount/limit rejection, SIWE admin denial, personal ownership/isolation, invite revocation and persistent relay gas/gate limits. Its LLM is explicitly scripted; this does not verify a new paid provider call.

`frontend/tests/judgeEntry.test.jsx` checks the no-account default journey, invite forwarding, personal-wallet selection and admin sign-in selection. Frontend production compilation is checked separately. No broad regression cycle was requested or run. Hosted sandbox persistence, real MetaMask clicks, live GPT proposal creation and actual new Sepolia execution remain approval-gated checks. Free backend cold starts and browser-driven automation are operational limitations.

Local results on 2026-10-17: backend focused file **14/14 passed**, frontend entry tests **4/4 passed**, production frontend build passed. The build reports a 637.64 kB main JavaScript chunk (211.40 kB gzip); this is a performance warning, not a build failure. `git diff --check` passed, with only Git CRLF normalization notices.

Hosted smoke completed on 2026-10-17: real GPT-4.1-mini planning (4 model calls, 5,561 input / 331 output tokens), browser confirmation, one successful 0.0001 ETH Sepolia payment, verified receipt, replay rejection (409), no-invite execution rejection (403), admin/legacy operator endpoint protection, strict CORS, mobile rendering with live treasury balance, evidence routing, and Neon proposal/session/daily-budget persistence after a Render service restart. The one-use smoke invite was revoked and a subsequent confirmation refused with `INVITE_REQUIRED` (403). No grants or unrestricted background jobs were enabled.

Live payment: https://sepolia.etherscan.io/tx/0x62ab63fafa92a9a1ae7f8037e90f1dfd59fe82ea925ee90911b68638e7ad7eaf . Remaining treasury after this payment: 0.0004 ETH. The original 12 successful transactions and 26 historical verification checks remain available, with the historical contract still paused and agent revoked. Public smoke data is in `evidence/interactive-sandbox/hosted-smoke.json`; operator instructions are in `docs/JUDGE_LIVE_QUICKSTART.md`.
