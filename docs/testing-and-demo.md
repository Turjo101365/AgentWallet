# Running, Testing and Demoing Locally

Everything below uses the local Hardhat chain (31337) and its public development accounts.
Nothing touches a public network.

## Prerequisites
- Node 20+
- Python 3.11+ (for the RL engine)
- MetaMask (for the browser demo)

```bash
cd contracts && npm ci && cd ../backend && npm ci && cd ../frontend && npm ci && cd ..
cd rl-engine && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt && cd ..
cp backend/.env.example backend/.env
```

On macOS/Linux the venv interpreter is `.venv/bin/python`.

## Run the stack (four terminals)
```bash
npm run chain          # 1. Hardhat node on :8545
npm run deploy:local   #    then deploy (writes contracts/deployments/localhost.json)
npm run dev:rl         # 2. RL engine on :8000
npm run dev:backend    # 3. backend on :4000 (PGlite in backend/data/pglite)
npm run dev:frontend   # 4. UI on :5173
```

Restarting the chain wipes it. If you do, redeploy and delete `backend/data/pglite` so
the database does not reference the old chain.

## MetaMask setup (local)
1. Add the network: RPC `http://127.0.0.1:8545`, chain id `31337`, currency ETH. The app also offers to add it.
2. Import Hardhat account **#0** (the owner) from the `npx hardhat node` output. It is a public
   test key, so use it only on the local chain.

## Demo script
1. Open http://localhost:5173 → Connect → Switch network → Sign in (a text signature, no transaction).
2. **Overview**: contract balances and caps read on-chain; the agent executor is authorized.
3. **Proposals**: create 0.005 ETH to "Demo payee A". You will see:
   - policy checks;
   - the simulation gas estimate;
   - a 3-minute TTL.
4. **Approve & sign**: MetaMask shows the typed approval (recipient, amount, token, deadline). The status moves
   Approved → Submitted → **Confirmed on-chain** only after the receipt is verified.
5. Try to break it:
   - 0.02 ETH: blocked by `PER_TX_LIMIT`;
   - a random address: `RECIPIENT_ALLOWLISTED`;
   - several 0.01 approvals: the daily cap holds.
6. **Risk controls**: pause the contract, and a new proposal is blocked (`CONTRACT_ACTIVE`). Emergency stop
   revokes the agent.
7. **Transactions** / **Audit log**: verified history and a hash chain marked "Chain valid".
8. **RL advisory**: set an allowlisted payee and evaluate. The policy is shown as a heuristic fallback, and
   any suggestion becomes a normal proposal that still needs your approval.

## Automated tests
```bash
cd contracts && npx hardhat test        # 30
cd backend && npm test                  # 59 (starts its own Hardhat nodes; needs compiled artifacts)
cd frontend && npx vitest run           # 13
cd rl-engine && .venv/Scripts/python -m unittest discover -s tests -p "test_*.py"   # 16
node --test tests/e2e/                  # 6: full stack, prints E2E_EVIDENCE
```

Results and evidence: [TEST_RESULTS.md](TEST_RESULTS.md).

## Docker (written, not yet verified)
`docker compose up --build` starts:
- Postgres;
- a Hardhat chain;
- a one-shot deployer;
- the RL engine, backend and frontend.

The backend uses `LOCAL_DEV_AGENT_INDEX=1`, which is refused on any non-local chain.
