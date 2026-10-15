# Real MetaMask verification (local chain)

The automated browser suite uses a test-only EIP-1193 bridge, not the MetaMask extension. This guide covers the manual pass with the real extension. Use a **separate Chrome profile with its own MetaMask**, never one that holds real funds.

## 1. Start the stack

```bash
npm run demo:metamask
```

This starts four things:
- a Hardhat node on `127.0.0.1:8545` (chainId 31337);
- the contract deploy;
- the backend on `:4000`, with a **fresh** database in `backend/data/demo/<timestamp>`;
- the console on `http://localhost:5173`.

Proposals expire after 10 minutes in this mode, against 180 s by default. Ctrl+C stops everything.

## 2. Prepare MetaMask (once per profile)

1. Import Hardhat account **#0**, the contract owner `0xf39F…2266`, using **Add account → Import account**. Its private key is the public Hardhat test key printed by `npx hardhat node` and listed in the Hardhat docs. Only import it into a test profile.
2. Network: let the console add it (step 3 below), or add it by hand: name `Hardhat Local`, RPC `http://127.0.0.1:8545`, chain ID `31337`, symbol `ETH`.
3. **After every restart of the demo**, open **Settings → Advanced → Clear activity tab data**. MetaMask caches nonces and block numbers per chain ID. A new Hardhat chain starts at nonce 0, so stale data causes "Nonce too high" or "invalid block tag". The console now explains this instead of showing "could not coalesce error".

## 3. Checklist

Wording checked against MetaMask 13.52.0 (see §5).

| # | Action in the console | What MetaMask shows | Pass if |
|---|---|---|---|
| 1 | **Connect wallet** | "Connect this website with MetaMask" for `localhost`, with one account | Step 1 turns green. If you reject it, the console says "You rejected the request in your wallet." |
| 2 | **Switch network** | "Add Hardhat Local" (first time), with RPC `127.0.0.1:8545` | Step 2 turns green |
| 3 | **Sign in** | A **Sign-in request** with "Request from: localhost:5173" and no red "suspicious / wrong domain" warning. The message reads "This signature does not authorize any transaction or spending", plus URL, chain ID 31337 and nonce | You land on the Overview with the `owner` badge |
| 4 | Proposals → create 0.001 ETH to Acme (#2) → **Approve & sign** | "Signature request", interacting with the AgentWallet contract `0x5FbDB…80aa3`. Primary type **ApproveTransfer**: ProposalId, IntentId, Token `0x00000…00000` (ETH), Recipient `0x3C44C…293BC`, Amount `1000000000000000` (wei), Deadline. MetaMask 13.52 does not show the domain name "AgentWallet Operator Approval" | Execution: CONFIRMED; the transaction hash appears in Transactions |
| 5 | The same, but **Cancel** in MetaMask | The same request | "You rejected the request in your wallet."; no balance change |
| 6 | Risk controls → **Pause contract**, then **Unpause** | "Transaction request" interacting with `0x5FbDB…80aa3`, network fee in ETH | "confirmed in block N" each time |
| 7 | Treasury → deposit 0.01 ETH | "Transaction request", amount 0.01 ETH, interacting with the contract | Contract balance goes up by 0.01 ETH |
| 8 | Automation → create a task → **Sign grant** | "Signature request", primary type **AuthorizeTask**: TaskId, Token, Recipient, AmountPerRun, MaxRuns, MaxTotal, ValidUntil. The domain name "AgentWallet Task Authorization" is not shown | Task becomes ACTIVE |
| 9 | AI agent → "Send 0.005 ETH to my approved supplier." | Nothing (the agent cannot sign) | A proposal with the badge "Awaiting approval"; approving it opens the request from row 4 with amount `5000000000000000` |
| 10 | In MetaMask, switch to another account **that is connected to this site** | — | The console signs you out (the session is bound to one address). Signing in again with a non-owner gives `viewer` |
| 11 | Put MetaMask on another network for this site | — | The console shows "Wrong network (…)" and replaces owner controls with the network gate; no signing request can be sent until you switch back |

Amounts in typed data are in base units (wei for ETH, 6 decimals for mUSDC). Compare them with the amount on the proposal card before signing.

**Row 10:** MetaMask 12+ only reports accounts that are connected to the site. Switching to an account that isn't connected changes nothing for the console, which stays bound to the connected owner. That is safe behaviour. To see the sign-out, first connect the second account to the site. In 13.52 that's the account row on the connect screen, which opens "Select accounts"; tick it and press **Save**, then **Connect**. Then switch.

**Row 11:** MetaMask 13.x keeps a network per site. Switching back to 31337 from the console's "Wrong network · switch to 31337" button needs no confirmation once 31337 is permitted for the site.

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Nonce too high" / "invalid block tag" / "cached data from an earlier run" | MetaMask history from a previous chain | Settings → Advanced → Clear activity tab data |
| "Your wallet already has a request waiting" | A MetaMask popup is still open (-32002) | Open the MetaMask icon and finish or reject it |
| MetaMask refuses to add the network ("chain ID … does not match") | A saved network uses `127.0.0.1:8545` with another chain ID (e.g. 1337) | Delete or edit that network in MetaMask |
| Red "suspicious sign-in" warning | The console was opened on a host the backend doesn't allow | Open `http://localhost:5173` (or `127.0.0.1:5173`); both are in `CORS_ORIGINS` |
| "Port … already in use" when starting | An old node, backend or Vite is still running | Stop it, then restart the demo |
| Switching accounts in MetaMask does nothing in the console | The new account isn't connected to this site | Connect it to the site first (row 10 note) |
| Imported the Hardhat **mnemonic** and see odd account names (e.g. "admin"), a mainnet balance, or "MetaMask had trouble starting · Background connection unresponsive" | MetaMask backup & sync pulls what other people stored under this public mnemonic | Import the single account #0 **private key** instead (§2), or turn off backup & sync |
| "Security check unavailable" banner, "HTTP" badge next to `localhost` | Blockaid can't screen a local chain; the console runs on plain HTTP locally | Expected on the local demo |

## 5. Results (real MetaMask, 2026-10-15)

**All 11 rows passed with the real MetaMask extension**, automated with Playwright. No application defects were found.

| | |
|---|---|
| MetaMask | 13.52.0, official Chrome build from GitHub releases. SHA-256 `8ea87cd4…5e4a`, matching the release `SHA256SUMS` |
| Browser | Playwright Chromium 156, a throwaway profile deleted after the run |
| Framework | Playwright 1.64.1, no Synpress (§6) |
| Stack | Its own Hardhat chain 31337, backend and console on random local ports. A second local chain 1338 was used for row 11. The demo stack was not touched |
| Contract | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Accounts | HD #0 = owner `0xf39F…2266`, HD #1 = `0x7099…79C8` |
| LLM | gpt-4.1-mini through `backend/.env`, for row 9 |
| Run | 2026-10-15 18:18–18:25 UTC, 6.7 min, `1 passed` |

Every approval and rejection below was clicked inside MetaMask's own confirmation window. The transaction hashes come from an ephemeral chain that no longer exists.

| # | Result | What MetaMask showed | Chain evidence | Notes |
|---|---|---|---|---|
| 1 | PASS | "localhost · Connect this website with MetaMask", Account 1, Cancel / Connect | Page account `0xf39f…2266` | Rejected once first; the console showed "You rejected the request in your wallet." |
| 2 | PASS | "Add Hardhat Local · Request from localhost:<port> · RPC 127.0.0.1:<port>" | Wallet chain 31337 | |
| 3 | PASS | "Sign-in request … Request from HTTP localhost:<port>", with the message "This signature does not authorize any transaction or spending", URL, chain ID 31337 and nonce | `owner` badge | **No suspicious / wrong-domain warning.** The domain and port match the page |
| 4 | PASS | "Signature request", interacting with `0x5FbDB…80aa3`. Primary type ApproveTransfer: ProposalId, IntentId, Token `0x00000…00000`, Recipient `0x3C44C…293BC`, Amount `1000000000000000`, Deadline | tx `0x8e1926d7…ed26f8`, block 9, status 1. Acme +0.001 ETH; hash listed in Transactions | Domain name not shown (see §3) |
| 5 | PASS | Same request, Cancel clicked | Acme balance unchanged | Console: "You rejected the request in your wallet." |
| 6 | PASS | "Transaction request", interacting with `0x5FbDB…80aa3`, network fee ~0.0001 ETH | Pause in block 10, unpause in block 11; `paused()` true, then false | |
| 7 | PASS | "Transaction request", Amount 0.01 ETH, interacting with the contract | Block 12; contract 5.009 ETH (5 − 0.001 from row 4 + 0.01) | |
| 8 | PASS | "Signature request", primary type AuthorizeTask: TaskId, Token, Recipient `0x3C44C…293BC`, AmountPerRun `1000000000000000`, MaxRuns 4, MaxTotal, ValidUntil | Task ACTIVE, then cancelled | Domain name not shown |
| 9 | PASS | None while the agent worked. On approval: ApproveTransfer with amount `5000000000000000` to `0x3C44C…293BC` | tx `0x5a1e3909…2b4431`, block 13, status 1 | Live LLM drafted the proposal; it showed "Awaiting approval" |
| 10 | PASS | Two sign-in requests (Account 2, then Account 1), same message as row 3 | Before connecting #1, the page saw only `0xf39f…`. After connecting #1 and switching, it saw `0x7099…` first, then `0xf39f…` | Owner session ended. Account #1 signed in as `viewer`; its `POST /proposals` got **403**. Back on #0, `owner` again |
| 11 | PASS | "Add Hardhat Local B (1338)", approved | On 1338: "Wrong network (1338)", no Pause button, network gate shown, no MetaMask request opened, `paused()` false | Switch requested by the page and approved in MetaMask. The switch back to 31337 needed no confirmation |

**Earlier manual attempt (same day):** Samprity started the checklist by hand, with Claude in Chrome unable to connect. Rows 1–2 passed on console evidence. Signing in with MetaMask's own account `0x74b7…825b` correctly got `viewer`. It was superseded by the automated run above.

**How the run was made reliable.** These are differences in the runner and in MetaMask 13.52, not application changes:

- **Hosts:** the browser resolves only `localhost`, `127.0.0.1` and the console's font hosts. Otherwise MetaMask's backup & sync blocked its background on public-mnemonic data ("Background connection unresponsive"). This also keeps MetaMask off mainnet.
- **Selectors:**
  - Playwright runs no scripts inside MetaMask pages, because LavaMoat scuttling breaks `page.evaluate` there.
  - Accounts are chosen by HD index, not name.
  - Onboarding handles 13.52's passkey screen and opts out of usage-data collection.

## 6. Real-extension runner

```bash
node scripts/setup-metamask.mjs
```

```bash
cd frontend && npm run test:metamask
```

- **Setup:** `setup-metamask.mjs` downloads the official Chrome build from MetaMask's GitHub releases and checks it against the release's `SHA256SUMS`. It unpacks to `frontend/.metamask/<version>` (gitignored). If the checksum doesn't match, nothing is unpacked.
- **Why not Synpress:** Synpress 4.1.2 needs `playwright-core` 1.48.2 (this repo uses 1.64.1), and its helpers target the MetaMask 11.9.1 UI.
- **Isolation:** the spec (`frontend/tests/metamask/checklist.spec.js`) starts its own Hardhat chain, backend and console on random ports, so the demo stack is not touched. MetaMask runs in a throwaway Chromium profile that is deleted afterwards. The browser resolves only local hosts.
- **Wallet:**
  - It imports the public Hardhat dev mnemonic with a random per-run password.
  - It never logs the mnemonic, and never screenshots or traces onboarding.
  - It never acknowledges a MetaMask security warning: the request is rejected and the warning recorded.
  - Before approving any typed data or transaction, it checks the expected contract, recipient and amount, and rejects if they don't match.
- **Options:**
  - `LIVE_LLM=1` runs row 9, which makes a paid API call with `LLM_*` from `backend/.env`; without it, row 9 is BLOCKED.
  - `HEADLESS=1` hides the window.
  - `MM_ROWS=1,2,3,10` runs only those rows; rows 1–3 connect and sign in, so later rows need them.
- **Output:**
  - `frontend/test-results/metamask/report.md` and `report.json` give each row PASS / FAIL / BLOCKED, the account and chain, what MetaMask showed, and tx hash or block.
  - Screenshots are saved per row.
  - When a row fails, `row-N-metamask-ui.json` lists the visible MetaMask test ids and button labels.
- **Run time:** about 7 minutes.

## What is verified automatically vs. here

- **Real extension:** `npm run test:metamask` covers MetaMask's own UI: the connect and sign-in screens, typed-data rendering, network add, account and network switching, and rejections (§5).
- **EIP-1193 bridge, no extension:** SIWE, EIP-712 approval and grant, real mined transactions, pause/unpause, rejection paths (`frontend/tests/browser/wallet.spec.js`). This is the fast suite run by `npx playwright test`.
- **MetaMask's error shapes through the real ethers `BrowserProvider`:** rejected connect, -32002, MetaMask Mobile's nested 4902, add-network refusal, "Nonce too high" (`frontend/tests/metamaskCompat.test.jsx`).
- **Still manual only:** MetaMask's nonce cache after a chain restart; its network menu itself (row 11 switches through a page request); MetaMask Mobile.
