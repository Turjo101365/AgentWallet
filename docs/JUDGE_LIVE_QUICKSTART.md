# Live AgentWallet judge demo

- Website: https://agentwallet-judge.vercel.app
- Backend readiness: https://agentwallet-judge-api.onrender.com/health/ready
- Ethereum Sepolia sandbox: `0x59a33154288009e030aa2072De46D32fC7d40d85`
- Runtime release: `62d63df9fd43e2554a970d364893c2dd83dc7257` (PR #7).

## Operator: issue an invite

1. Open the website, choose **Owner / Admin**, connect the approved admin wallet `0x74B7a41E3f4949315364DAd08e1142b38870825b` on Sepolia and sign the SIWE sign-in message. No private key or password is requested.
2. The backend independently checks the admin allowlist. Create a one-use judge invite and share it privately. The code is displayed once.
3. The launch smoke-test invite is revoked. Create fresh invites for judges; never publish invite codes in Git or screenshots.

## Judge: no MetaMask needed

1. Select **Judge → Use demo wallet**. Without a code, use explore mode for the dashboard, real AI planning, risk assessment and historical evidence.
2. For a live payment, enter an operator-provided invite code at entry.
3. Open **AI agent** and ask: “Prepare 0.0001 ETH to the approved demo recipient.” Review the proposed amount, recipient, policy/risk checks and deadline.
4. Check the confirmation box and select **Confirm demo authorization**. The dedicated backend demo owner key signs after confirmation; this is not a signature from the judge's own wallet.
5. Wait for **CONFIRMED** and the verified Sepolia receipt. Open its Etherscan link. Pending and failed transactions are not presented as successful payments.

Limits: 0.0001 ETH/payment, 3 payments/session, 3 payments/day globally and 0.0003 ETH/day globally. The launch smoke consumed one payment on 2026-10-17 UTC. Treasury started with 0.0005 ETH and is now 0.0004 ETH, with a protected 0.0002 ETH reserve. No automatic replenishment occurs.

**Evidence** is separate and preserves the paused/revoked historical v2 contract, its 12 successful transactions and 26 recorded checks. New live payments use the separate sandbox above.

Optional personal-wallet mode requires SIWE and a separately funded, admin-registered sandbox owned by that wallet. No personal sandbox is automatically deployed. Bounded demo automation requires its own explicit grant confirmation and an open automation page to process due runs; background spending remains disabled.

## Operations

Hosting remains Vercel Hobby, Render Free and Neon Free; OpenAI usage is metered separately. Free backend cold starts may delay initial loading. Do not repeatedly submit a payment while waiting for its receipt.

Owner/admin controls can disable execution, revoke invites or pause/emergency-stop only the new sandbox. Already broadcast transactions cannot be recalled. Backend secrets never go in Vercel variables or Git.

The temporary Render deployment API key is not an application credential and may be revoked after the verified rollout. Revoking it does not remove the backend's OpenAI, PostgreSQL or sandbox signer environment secrets.

The focused hosted smoke used one real AI planning request and one confirmed payment. AI drafting and confirmation were checked across two browser contexts, resuming the same persisted proposal after correcting a selector in the test harness; no second AI proposal or payment was substituted. This was an essential smoke check, not a full browser or security regression suite.
