// Mini-clip specification. Every segment is genuine footage cut from a named source file between `from` and `to`
// (source seconds). Highlights are boxes drawn over real UI; `mark` boxes come from element rectangles the replay
// recorder logged at capture time. Nothing here synthesises UI, logs or confirmations.

export const SOURCES = {
  raw: { src: 'sepolia-raw.webm', w: 1440, h: 900, kind: 'public', t0: Date.parse('2026-10-16T10:03:52.8Z'), file: 'evidence/sepolia/recordings/raw/agentwallet-sepolia-raw.webm' },
  explorer: { src: 'explorer-verification.webm', w: 1440, h: 900, kind: 'verify', t0: Date.parse('2026-10-16T10:22:13.469Z'), file: 'evidence/sepolia/recordings/raw/explorer-verification.webm' },
  owner: { src: 'replay-owner.webm', w: 1920, h: 1080, kind: 'replay', rec: 'replay-owner', file: 'evidence/submission/footage/replay-owner.webm' },
  viewer: { src: 'replay-viewer.webm', w: 1920, h: 1080, kind: 'replay', rec: 'replay-viewer', file: 'evidence/submission/footage/replay-viewer.webm' },
  audit: { src: 'term-audit.webm', w: 1920, h: 1080, kind: 'liveverify', term: 'audit', file: 'evidence/submission/footage/term-audit.webm' },
  ownerapproval: { src: 'term-owner-approval.webm', w: 1920, h: 1080, kind: 'liveverify', term: 'owner-approval', file: 'evidence/submission/footage/term-owner-approval.webm' },
  receipts: { src: 'term-receipts.webm', w: 1920, h: 1080, kind: 'liveverify', term: 'receipts', file: 'evidence/submission/footage/term-receipts.webm' },
  sectests: { src: 'term-security-tests.webm', w: 1920, h: 1080, kind: 'local', term: 'security-tests', file: 'evidence/submission/footage/term-security-tests.webm' },
  agenttests: { src: 'term-agent-tests.webm', w: 1920, h: 1080, kind: 'local', term: 'agent-tests', file: 'evidence/submission/footage/term-agent-tests.webm' },
  ctests: { src: 'term-contract-tests.webm', w: 1920, h: 1080, kind: 'local', term: 'contract-tests', file: 'evidence/submission/footage/term-contract-tests.webm' },
  e2e: { src: 'term-e2e.webm', w: 1920, h: 1080, kind: 'local', term: 'e2e', file: 'evidence/submission/footage/term-e2e.webm' },
  diagram: { image: 'architecture.png', w: 1920, h: 1080, kind: 'diagram', file: 'submission/01-technical-documentation/architecture.svg' },
  diagram2: { src: 'architecture-v2-screen.webm', w: 1920, h: 1080, kind: 'diagram', file: 'evidence/submission/footage/architecture-v2-screen.webm' },
  mm: { src: 'metamask-dapp.webm', w: 1360, h: 900, kind: 'localmm', file: 'evidence/submission/footage/metamask/metamask-dapp.webm' },
  mmConnect: { src: 'mm-connect.webm', w: 1360, h: 900, kind: 'localmm', file: 'evidence/submission/footage/metamask/mm-connect.webm' },
  mmSignin: { src: 'mm-signin.webm', w: 1360, h: 900, kind: 'localmm', file: 'evidence/submission/footage/metamask/mm-signin.webm' },
  mmApprove: { src: 'mm-approve.webm', w: 1360, h: 900, kind: 'localmm', file: 'evidence/submission/footage/metamask/mm-approve.webm' },
  mmPause: { src: 'mm-pause.webm', w: 1360, h: 900, kind: 'localmm', file: 'evidence/submission/footage/metamask/mm-pause.webm' },
};

// Frequently used rectangles in the 1440x900 original run recording (old console layout).
const RAW = {
  chat: { x: 250, y: 40, w: 1190, h: 640 },
  chatZoom: { x: 530, y: 230, w: 910, h: 480 },
  input: { x: 545, y: 395, w: 900, h: 70 },
  proposal: { x: 270, y: 140, w: 1150, h: 720 },
  checks: { x: 292, y: 351, w: 548, h: 406 },
  exec: { x: 292, y: 777, w: 1096, h: 71 },
  controls: { x: 250, y: 90, w: 1180, h: 340 },
  alert: { x: 272, y: 176, w: 1136, h: 72 },
  emergencyRow: { x: 272, y: 272, w: 1136, h: 140 },
  task: { x: 260, y: 520, w: 1160, h: 340 },
  log: { x: 0, y: 20, w: 1300, h: 300 },
};
const EXP = { details: { x: 0, y: 200, w: 1440, h: 640 }, rows: { x: 18, y: 466, w: 1150, h: 340 }, head: { x: 18, y: 225, w: 1300, h: 70 } };
const AUDIT = { row: (n) => ({ x: 22, y: 155 + (n - 1) * 28.52, w: 1290, h: 28 }), rows: (a, b) => ({ x: 22, y: 155 + (a - 1) * 28.52, w: 1290, h: (b - a + 1) * 28.52 }), valid: { x: 22, y: 810, w: 1130, h: 30 }, txs: { x: 22, y: 868, w: 1120, h: 146 } };

const seg = (source, from, to, extra = {}) => ({ source, from, to, ...extra });

export const CLIPS = [
  {
    id: '01-dashboard', title: 'Project overview & dashboard', criterion: 'Innovation & Interaction (30%) · Task completion (40%)',
    segments: [
      seg('owner', 14.0, 18.7, { caption: 'Treasury, agent status and kill switches: live from the public contract', highlights: [{ mark: 'treasury', from: 14.4, to: 16.0 }, { mark: 'stats', from: 16.1, to: 17.4, text: 'approvals · agent transfers · audit chain · gas' }, { mark: 'killswitch', from: 17.5, to: 18.6 }] }),
      seg('owner', 20.4, 24.0, { caption: 'AI command center', highlights: [{ mark: 'command-center', from: 20.9, to: 23.9 }] }),
      seg('owner', 26.0, 29.6, { caption: 'Risk engine: caps and recent policy decisions', highlights: [{ mark: 'risk-engine', from: 26.5, to: 29.5 }] }),
      seg('owner', 31.6, 35.0, { caption: 'Autonomous operations under signed task grants', highlights: [{ mark: 'autonomy', from: 32.1, to: 34.9 }] }),
      seg('owner', 37.2, 40.4, { caption: 'Verified transactions, each linked to the public explorer', highlights: [{ mark: 'transactions', from: 37.7, to: 40.3 }] }),
      seg('owner', 42.8, 46.2, { caption: 'Live hash-chained audit trail', highlights: [{ mark: 'activity', from: 43.3, to: 46.1 }] }),
    ],
  },
  {
    id: '02-ai-command', title: 'AI command center', criterion: 'Task completion (AI agent) · Innovation & Interaction', model: 'gpt-4.1-mini (openai-compatible), real API calls during the public run',
    segments: [
      seg('raw', 200.0, 206.0, { caption: 'Owner types a natural-language instruction', camera: [{ at: 200, rect: RAW.chat }], highlights: [{ rect: RAW.input, from: 200.6, to: 205.9, text: 'instruction → gpt-4.1-mini' }] }),
      seg('raw', 211.5, 218.5, { caption: 'gpt-4.1-mini plans and calls tools: list_recipients → record_plan → propose_transfer', camera: [{ at: 211.5, rect: RAW.chat }, { at: 214.6, rect: RAW.chatZoom }] }),
      seg('owner', 58.4, 62.7, { caption: 'Same public-run turn in the redesigned console: tool input and output', highlights: [{ mark: 'conv-transfer-tool', from: 58.9, to: 62.6, text: 'propose_transfer → AWAITING_APPROVAL' }] }),
      seg('owner', 64.0, 67.6, { caption: 'Result: a transfer proposal that still needs the owner', highlights: [{ mark: 'conv-transfer-actions', from: 64.4, to: 67.5 }] }),
    ],
  },
  {
    id: '03-risk-engine', title: 'Risk engine & policy evaluation', criterion: 'Security & Compliance (30%) · Task completion',
    segments: [
      seg('owner', 106.9, 110.9, { caption: 'Block-pinned policy checks on every transfer (15 for a task run, incl. AUTOMATION_ACTIVE)', camera: [{ at: 107.3, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 107.55, mark: 'confirmed-0-checks' }], highlights: [{ mark: 'confirmed-0-checks', from: 107.5, to: 110.8, text: 'allowlist · per-tx cap · daily cap · reserve · gas · simulation' }] }),
      seg('owner', 119.0, 122.5, { caption: 'Owner-approved transfer: all checks passed, signature required', camera: [{ at: 119.1, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 119.35, mark: 'confirmed-1-checks' }], highlights: [{ mark: 'confirmed-1-checks', from: 119.2, to: 122.4 }] }),
      seg('owner', 132.0, 136.1, { caption: 'Unsafe draft: two checks fail', camera: [{ at: 132.0, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 132.25, mark: 'rejected-checks' }], highlights: [{ mark: 'rejected-checks', from: 132.3, to: 136.0, text: 'PER_TX_LIMIT ✗ · BALANCE_AND_RESERVE ✗' }] }),
      seg('owner', 137.6, 140.8, { caption: 'Result: blocked before any signature or broadcast', highlights: [{ mark: 'rejected-alert', from: 137.8, to: 140.7 }] }),
      seg('owner', 195.5, 198.6, { caption: 'Owner policy: reserve floor, auto-approval limit, circuit breaker', highlights: [{ mark: 'policy-settings', from: 195.8, to: 198.5 }] }),
      seg('owner', 200.6, 203.7, { caption: 'Contract caps, enforced on-chain by executeTransfer', highlights: [{ mark: 'limits', from: 200.9, to: 203.6 }] }),
    ],
  },
  {
    id: '04-rejected-transaction', title: 'Rejected unsafe transaction (0.0003 ETH)', criterion: 'Security & Compliance (30%)', model: 'gpt-4.1-mini',
    segments: [
      seg('raw', 268.0, 271.6, { caption: 'Instruction: send 0.0003 ETH (above the 0.0002 ETH per-tx cap)', camera: [{ at: 268, rect: RAW.chat }], highlights: [{ rect: RAW.input, from: 268.3, to: 271.5 }] }),
      seg('raw', 277.6, 281.0, { caption: 'Policy engine rejects the AI draft; the agent explains why', camera: [{ at: 277.6, rect: RAW.chat }, { at: 278.0, rect: { x: 520, y: 300, w: 920, h: 480 } }], highlights: [{ rect: { x: 560, y: 480, w: 780, h: 235 }, from: 278.8, to: 280.9, text: 'per-tx cap 0.0002 ETH · balance below reserve' }] }),
      seg('owner', 132.2, 136.1, { caption: 'The exact failed checks', camera: [{ at: 132.2, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 132.45, mark: 'rejected-checks' }], highlights: [{ mark: 'rejected-checks', from: 132.4, to: 136.0, text: 'PER_TX_LIMIT ✗ · BALANCE_AND_RESERVE ✗' }] }),
      seg('owner', 137.6, 141.4, { caption: 'Blocked by policy: never signed, never broadcast', highlights: [{ mark: 'rejected-alert', from: 137.8, to: 141.3 }] }),
      seg('audit', 12.0, 15.6, { caption: 'Audit log: rejection recorded off-chain with no transaction hash', highlights: [{ rect: AUDIT.row(10), from: 12.2, to: 15.5, text: '#10 PROPOSAL_POLICY_REJECTED · no tx' }] }),
    ],
  },
  {
    id: '05-owner-approval', title: 'Owner approval & EIP-712 signature', criterion: 'Security & Compliance · Task completion',
    segments: [
      seg('raw', 219.3, 225.6, { caption: 'Owner reviews the AI-drafted transfer and signs exactly this transfer (EIP-712)', camera: [{ at: 219.3, rect: RAW.proposal }] }),
      seg('raw', 262.0, 268.0, { caption: 'Agent key executes; receipt verified on-chain', camera: [{ at: 262.0, rect: RAW.proposal }], highlights: [{ rect: RAW.exec, from: 262.4, to: 264.8, text: 'Execution: SUBMITTED · awaiting receipt' }, { rect: RAW.exec, from: 265.1, to: 267.9, text: 'Execution: CONFIRMED · block 11926668' }] }),
      seg('owner', 124.0, 126.9, { caption: 'Approved by the owner signature (0x10A0…b5ba)', highlights: [{ mark: 'confirmed-1-exec', from: 124.2, to: 126.8 }] }),
      seg('explorer', 64.2, 70.0, { caption: 'Public explorer: Success · executeTransfer · sent by the agent key', camera: [{ at: 64.2, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 64.6, to: 69.9, text: '0x2c83a855…2e37fb' }] }),
    ],
    note: 'Signing in the public run used the test-only EIP-1193 bridge (programmatic owner key), not the MetaMask extension. See 12-metamask-local for real MetaMask signing on a local chain.',
  },
  {
    id: '05-owner-approval-v2', title: 'Owner approval & EIP-712 signature (v2)', criterion: 'Security & Compliance (30%) · Task completion · Execution evidence',
    note: 'Public signing used the test-only EIP-1193 bridge holding the owner key. The final segment is a SEPARATE local Hardhat run with the real MetaMask extension, labelled as such; it is not the public transaction.',
    segments: [
      seg('raw', 217.0, 219.5, { caption: 'AI-generated proposal (gpt-4.1-mini · propose_transfer)', camera: [{ at: 217.0, rect: RAW.chat }, { at: 217.4, rect: { x: 560, y: 360, w: 790, h: 440 } }], highlights: [{ rect: { x: 585, y: 375, w: 730, h: 255 }, from: 217.8, to: 219.45, text: 'AWAITING_APPROVAL · owner must review and sign' }] }),
      seg('raw', 219.9, 222.1, { kind: 'publicbridge', caption: 'Owner authorization required: policy passed, EIP-712 signature requested', camera: [{ at: 219.9, rect: { x: 272, y: 205, w: 1140, h: 670 } }], highlights: [{ rect: { x: 285, y: 772, w: 1110, h: 85 }, from: 220.0, to: 222.05, text: 'Sign in wallet… (EIP-712 ApproveTransfer)' }] }),
      seg('raw', 222.4, 225.3, { kind: 'publicbridge', caption: 'Signature accepted: approved by the owner, not by the AI', camera: [{ at: 222.4, rect: { x: 272, y: 205, w: 1140, h: 670 } }], highlights: [{ rect: { x: 285, y: 828, w: 350, h: 60 }, from: 222.5, to: 225.25, text: 'APPROVED_BY_OWNER · 0x10A0…b5ba' }] }),
      seg('ownerapproval', 12.6, 15.6, { caption: 'What the owner signed: EIP-712 ApproveTransfer, bound to chain, contract, intent, recipient, amount, deadline', camera: [{ at: 12.6, rect: { x: 0, y: 150, w: 1420, h: 330 } }], highlights: [{ rect: { x: 20, y: 230, w: 1340, h: 230 }, from: 12.8, to: 15.55 }] }),
      seg('ownerapproval', 15.6, 18.6, { caption: 'EIP-712 signature verified: recovered signer = contract owner()', camera: [{ at: 15.6, rect: { x: 0, y: 470, w: 1520, h: 140 } }], highlights: [{ rect: { x: 20, y: 486, w: 1475, h: 100 }, from: 15.8, to: 18.55 }] }),
      seg('ownerapproval', 18.6, 21.6, { caption: 'Authorized execution: agent key sent exactly the signed intent, recipient and amount', camera: [{ at: 18.6, rect: { x: 0, y: 600, w: 1100, h: 230 } }], highlights: [{ rect: { x: 20, y: 612, w: 1010, h: 205 }, from: 18.8, to: 21.55 }] }),
      seg('ownerapproval', 21.6, 24.0, { caption: 'Limitation: the signature is checked off-chain by the backend; the contract enforces agent-only, allowlist and caps', camera: [{ at: 21.6, rect: { x: 0, y: 830, w: 1300, h: 150 } }], highlights: [{ rect: { x: 20, y: 840, w: 1225, h: 75 }, from: 21.8, to: 23.95 }] }),
      seg('raw', 263.0, 267.7, { caption: 'Agent key executes; status only CONFIRMED after the receipt', camera: [{ at: 263.0, rect: RAW.proposal }], highlights: [{ rect: RAW.exec, from: 263.1, to: 264.8, text: 'Execution: SUBMITTED · awaiting receipt' }, { rect: RAW.exec, from: 265.1, to: 267.65, text: 'Execution: CONFIRMED · block 11926668' }] }),
      seg('explorer', 64.6, 69.1, { caption: 'Public Sepolia transaction confirmed: Success · block 11926668 · sent by the agent key', camera: [{ at: 64.6, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 64.9, to: 69.05, text: '0x2c83a855…2e37fb' }] }),
      seg('mmApprove', 16.4, 19.7, { caption: 'Separate LOCAL Hardhat run (different proposal): an ApproveTransfer request in the real MetaMask extension', camera: [{ at: 16.4, rect: { x: 230, y: 0, w: 900, h: 900 } }], highlights: [{ rect: { x: 297, y: 412, w: 766, h: 280 }, from: 16.5, to: 19.65, text: 'proposalId · intentId · token · recipient · amount · deadline' }] }),
    ],
  },
  {
    id: '06-autonomous-execution', title: 'Autonomous on-chain execution', criterion: 'Task completion (autonomous execution) · On-chain bonus', model: 'gpt-4.1-mini',
    segments: [
      seg('raw', 295.5, 299.4, { caption: 'User-defined intent: a one-time payment, valid for 1 day', camera: [{ at: 295.5, rect: RAW.chat }], highlights: [{ rect: RAW.input, from: 295.8, to: 299.3 }] }),
      seg('raw', 303.6, 308.6, { caption: 'AI agent drafts the task (schedule_payment): inactive until the owner signs', camera: [{ at: 303.6, rect: RAW.chat }, { at: 304.4, rect: RAW.chatZoom }] }),
      seg('raw', 313.0, 317.0, { caption: 'OWNER ACTION, ONCE: signs the bounded task grant (EIP-712)', camera: [{ at: 313, rect: RAW.task }] }),
      seg('raw', 484.0, 488.4, { caption: 'AUTONOMOUS: scheduler + agent key execute with no per-transfer signature', camera: [{ at: 484, rect: RAW.task }] }),
      seg('owner', 151.3, 156.0, { caption: 'Risk evaluation of the run: passed policy, approval route AUTO_GRANT', camera: [{ at: 151.3, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 151.55, mark: 'task-runs' }], highlights: [{ mark: 'task-runs', from: 151.5, to: 155.9, text: 'approval_kind = TASK_GRANT' }] }),
      seg('explorer', 74.0, 79.8, { caption: 'Public receipt: Success · block 11926686', camera: [{ at: 74, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 74.4, to: 79.7, text: '0xedeb6b97…e3cec3' }] }),
      seg('audit', 12.0, 16.2, { caption: 'Audit chain: run created → auto-approved by grant → submitted → confirmed', highlights: [{ rect: AUDIT.rows(16, 22), from: 12.2, to: 16.1 }] }),
    ],
  },
  {
    id: '07-contract-deployment', title: 'Public smart-contract deployment', criterion: 'Execution evidence · On-chain bonus',
    segments: [
      seg('raw', 66.0, 76.0, { caption: 'Live run log: deployer deploys AgentWallet on Ethereum Sepolia', camera: [{ at: 66, rect: RAW.log }], highlights: [{ rect: { x: 20, y: 196, w: 1210, h: 46 }, from: 73.6, to: 75.9, text: '0x8A44716E…F956a6' }] }),
      seg('explorer', 8.0, 12.0, { caption: 'Contract page on the public explorer', camera: [{ at: 8.0, rect: { x: 0, y: 150, w: 1440, h: 700 } }] }),
      seg('explorer', 35.2, 41.0, { caption: 'Deployment transaction: Success · block 11926653', camera: [{ at: 35.2, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 35.6, to: 40.9, text: '0x7d7492bf…ae1ad3' }] }),
    ],
  },
  {
    id: '08-public-verification', title: 'Public transaction verification', criterion: 'Execution evidence (06) · On-chain bonus',
    segments: [
      seg('explorer', 64.6, 70.0, { caption: 'Owner-approved AI transfer', camera: [{ at: 64.6, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 65.0, to: 69.9, text: 'Success · block 11926668' }] }),
      seg('explorer', 74.4, 79.8, { caption: 'Autonomous AI transfer (task grant)', camera: [{ at: 74.4, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 74.8, to: 79.7, text: 'Success · block 11926686' }] }),
      seg('receipts', 3.0, 9.8, { caption: 'Independent receipt check over a public RPC: status, block, sender, decoded events' }),
      seg('receipts', 13.4, 18.0, { caption: 'All 11 transactions successful; contract now paused, agent revoked', highlights: [{ rect: { x: 20, y: 930, w: 1840, h: 80 }, from: 13.6, to: 17.9 }] }),
    ],
  },
  {
    id: '09-emergency-controls', title: 'Pause, unpause & emergency stop', criterion: 'Security & Compliance (30%)',
    segments: [
      seg('raw', 489.6, 493.6, { caption: 'Owner pauses the contract (wallet transaction)', camera: [{ at: 489.6, rect: RAW.controls }], highlights: [{ rect: RAW.alert, from: 490.0, to: 493.5 }] }),
      seg('raw', 502.0, 506.0, { caption: 'Contract: Paused', camera: [{ at: 502.0, rect: RAW.controls }], highlights: [{ rect: RAW.emergencyRow, from: 502.1, to: 505.9 }] }),
      seg('raw', 525.6, 529.6, { caption: 'Owner unpauses: submitted, then confirmed in block 11926691', camera: [{ at: 525.6, rect: RAW.controls }], highlights: [{ rect: RAW.alert, from: 525.8, to: 527.0, text: 'submitted, waiting for confirmation' }, { rect: RAW.alert, from: 528.0, to: 529.5, text: 'confirmed in block 11926691' }] }),
      seg('raw', 532.0, 535.2, { caption: 'Emergency stop: pause + revoke the agent key in one transaction', camera: [{ at: 532, rect: RAW.controls }] }),
      seg('raw', 539.4, 543.2, { caption: 'Emergency stop: submitted, then confirmed in block 11926692', camera: [{ at: 539.4, rect: RAW.controls }], highlights: [{ rect: RAW.alert, from: 539.6, to: 541.1, text: 'submitted, waiting for confirmation' }, { rect: RAW.alert, from: 541.4, to: 543.1, text: 'confirmed in block 11926692' }] }),
      seg('explorer', 103.4, 108.7, { caption: 'Public receipt: emergencyStop · Paused, AgentUpdated, EmergencyStop', camera: [{ at: 103.4, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 103.8, to: 108.6, text: '0xfe627133…e53a8d' }] }),
    ],
  },
  {
    id: '10-permission-security', title: 'Permission tiers & security', criterion: 'Security & Compliance (30%)',
    segments: [
      seg('viewer', 12.6, 15.0, { caption: 'VIEWER: a different wallet signs in read-only', highlights: [{ mark: 'role-badge', from: 13.7, to: 14.9, spot: false }] }),
      seg('viewer', 19.0, 24.0, { caption: 'Viewer cannot pause, stop or change limits (backend + contract onlyOwner)', highlights: [{ mark: 'viewer-alert', from: 19.3, to: 23.9 }] }),
      seg('viewer', 28.2, 32.2, { caption: 'Viewer cannot use the AI agent', highlights: [{ mark: 'viewer-agent-alert', from: 28.4, to: 32.1 }] }),
      seg('owner', 219.8, 224.6, { caption: 'Authority split: owner key in the wallet, agent key bounded by the contract', highlights: [{ mark: 'authority', from: 220.3, to: 224.5 }] }),
      seg('sectests', 25.0, 30.0, { caption: 'Backend authorization tests (local): unauthenticated, viewer and forged approvals rejected' }),
      seg('ctests', 12.2, 16.2, { caption: 'Contract tests (local Hardhat): onlyOwner, onlyAgent, caps, allowlist, pause' }),
    ],
  },
  {
    id: '11-audit-monitoring', title: 'Audit trail & AI monitoring', criterion: 'Security & Compliance · Innovation (explainability)', model: 'gpt-4.1-mini',
    segments: [
      seg('owner', 58.6, 62.7, { caption: 'AI decision log: model, calls, plan and every tool call (input and output) are stored', highlights: [{ mark: 'conv-transfer-tool', from: 58.9, to: 62.6 }] }),
      seg('owner', 175.0, 178.1, { caption: 'Audit log: append-only, hash-chained', highlights: [{ mark: 'audit-badge', from: 175.3, to: 178.0, spot: false, text: 'entries 23+ are this replay\'s own sign-ins' }] }),
      seg('owner', 180.3, 183.6, { caption: 'Each execution entry carries its public transaction hash', highlights: [{ mark: 'audit-row', from: 180.4, to: 183.5 }] }),
      seg('raw', 558.4, 561.0, { caption: 'During the public run: chain valid · 22 entries', camera: [{ at: 558.4, rect: { x: 250, y: 40, w: 1190, h: 640 } }] }),
      seg('audit', 9.4, 11.8, { caption: 'Independent re-computation of the 22-entry chain from the public run' }),
      seg('audit', 11.8, 16.35, { caption: 'CHAIN VALID; executions correlated to public transaction hashes', highlights: [{ rect: AUDIT.valid, from: 12.0, to: 13.9 }, { rect: AUDIT.txs, from: 14.0, to: 16.25 }] }),
    ],
  },
  {
    id: '12-metamask-local', title: 'MetaMask integration (LOCAL HARDHAT)', criterion: 'Security & Compliance · Innovation & Interaction',
    note: 'Real MetaMask 13.52.0 extension on a local Hardhat chain (31337), driven by the checklist harness. The public Sepolia run did NOT use MetaMask.',
    segments: [
      seg('mm', 36.0, 39.5, { caption: 'Connect wallet with the real MetaMask extension', camera: [{ at: 36, rect: { x: 0, y: 0, w: 1360, h: 900 } }] }),
      seg('mmConnect', 25.0, 28.4, { caption: 'MetaMask: connect this site (Account 1)', camera: [{ at: 25, rect: { x: 230, y: 0, w: 900, h: 900 } }] }),
      seg('mm', 88.0, 91.5, { caption: 'Network verification: the console refuses the wrong chain', camera: [{ at: 88, rect: { x: 0, y: 0, w: 1360, h: 900 } }] }),
      seg('mmSignin', 6.4, 9.6, { caption: 'SIWE sign-in request: no transaction, no spending', camera: [{ at: 6.4, rect: { x: 230, y: 0, w: 900, h: 900 } }] }),
      seg('mm', 178.0, 181.5, { caption: 'Signed in as owner; a transfer awaits approval', camera: [{ at: 178, rect: { x: 0, y: 0, w: 1360, h: 900 } }] }),
      seg('mmApprove', 15.8, 19.4, { caption: 'EIP-712 ApproveTransfer: exact proposal, intent, recipient, amount, deadline', camera: [{ at: 15.8, rect: { x: 230, y: 0, w: 900, h: 900 } }] }),
      seg('mm', 237.0, 241.0, { caption: 'Transfer confirmed on the local chain', camera: [{ at: 237, rect: { x: 0, y: 0, w: 1360, h: 900 } }] }),
      seg('mmPause', 10.4, 13.2, { caption: 'Owner transaction in MetaMask: pause the contract', camera: [{ at: 10.4, rect: { x: 230, y: 0, w: 900, h: 900 } }] }),
    ],
  },
  {
    id: '13-system-architecture', title: 'System architecture', criterion: 'Technical documentation (01) · Task completion',
    segments: [
      seg('diagram', 0, 9, { caption: 'Components and trust boundaries (explanatory diagram)', camera: [{ at: 0, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 4.5, rect: { x: 300, y: 140, w: 1320, h: 742 } }] }),
      seg('e2e', 29.2, 33.4, { caption: 'Running components end to end (local): chain, backend, SIWE, executor, indexer, scheduler, RL checkpoints', camera: [{ at: 29.2, rect: { x: 0, y: 40, w: 1200, h: 330 } }] }),
      seg('e2e', 34.2, 37.3, { caption: 'End-to-end suite: 8 tests, 8 pass, 0 fail (local)', camera: [{ at: 34.2, rect: { x: 0, y: 760, w: 1100, h: 300 } }] }),
      seg('owner', 219.8, 224.8, { caption: 'Live health of the console against the public deployment (replay: executor deliberately disabled)', highlights: [{ mark: 'health', from: 220.2, to: 224.7 }] }),
    ],
  },
  {
    id: '13-system-architecture-v2', title: 'System architecture (v2)', criterion: 'Technical documentation (01) · Task completion · Security & Compliance',
    note: 'Explanatory diagram only (source: submission/01-technical-documentation/architecture-v2.svg), screen-recorded in a browser; it is not execution evidence. No test output.',
    segments: [
      seg('diagram2', 1.0, 4.5, { caption: 'AgentWallet architecture: six layers, one payment path' }),
      seg('diagram2', 4.5, 9.0, { caption: '1–2 · User and AI: console → API → agent orchestrator ↔ gpt-4.1-mini → typed tools (drafts only)', camera: [{ at: 4.5, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 4.6, rect: { x: 40, y: 120, w: 680, h: 680 } }], highlights: [{ rect: { x: 40, y: 150, w: 316, h: 640 }, from: 5.4, to: 6.9 }, { rect: { x: 368, y: 150, w: 342, h: 640 }, from: 7.0, to: 8.95 }] }),
      seg('diagram2', 9.0, 14.5, { caption: '3–4 · Risk and authorization boundary: deterministic checks, then the owner signs one transfer or a bounded grant', camera: [{ at: 9.0, rect: { x: 716, y: 120, w: 760, h: 680 } }], highlights: [{ rect: { x: 722, y: 150, w: 342, h: 640 }, from: 9.8, to: 11.9, text: 'the model cannot override these checks' }, { rect: { x: 1094, y: 200, w: 356, h: 310 }, from: 12.0, to: 14.45, text: 'EIP-712: ApproveTransfer or AuthorizeTask' }] }),
      seg('diagram2', 14.5, 19.0, { caption: '5 · Only the agent key executes; the contract enforces allowlist, caps and one-time intents on Ethereum Sepolia', camera: [{ at: 14.5, rect: { x: 1460, y: 120, w: 430, h: 680 } }], highlights: [{ rect: { x: 1498, y: 200, w: 364, h: 150 }, from: 15.3, to: 16.5 }, { rect: { x: 1498, y: 368, w: 364, h: 250 }, from: 16.6, to: 17.9 }, { rect: { x: 1498, y: 636, w: 364, h: 136 }, from: 18.0, to: 18.95 }] }),
      seg('diagram2', 19.0, 23.5, { caption: '6 · Logging and verification: hash-chained audit log, receipt-verified history, public explorers', camera: [{ at: 19.0, rect: { x: 40, y: 790, w: 1010, h: 270 } }, { at: 21.4, rect: { x: 1040, y: 790, w: 840, h: 270 } }], highlights: [{ rect: { x: 496, y: 860, w: 540, h: 168 }, from: 19.6, to: 21.3, text: 'SHA-256 hash chain · append-only' }, { rect: { x: 1054, y: 860, w: 808, h: 168 }, from: 22.1, to: 23.45 }] }),
      seg('diagram2', 23.5, 27.0, { caption: 'RL timing is an optional, local-only advisor: not part of the live decision path or the public run', camera: [{ at: 23.5, rect: { x: 0, y: 0, w: 1920, h: 1080 } }], highlights: [{ rect: { x: 1094, y: 688, w: 356, h: 84 }, from: 24.3, to: 26.95 }] }),
    ],
  },
  {
    id: '14-innovation', title: 'Innovation: policy-bounded, explainable, verifiable autonomy', criterion: 'Innovation & Interaction (30%) · On-chain bonus',
    segments: [
      seg('owner', 151.3, 155.6, { caption: 'Policy-bounded autonomy: a signed grant, not a blank cheque', camera: [{ at: 151.3, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 151.55, mark: 'task-runs' }], highlights: [{ mark: 'task-runs', from: 151.5, to: 155.5, text: 'AUTO_GRANT: within grant and auto-approval limit' }] }),
      seg('raw', 277.6, 281.0, { caption: 'Explainable AI: the agent reports why policy refused its own draft', camera: [{ at: 277.6, rect: RAW.chat }, { at: 278.0, rect: { x: 520, y: 300, w: 920, h: 480 } }], highlights: [{ rect: { x: 560, y: 480, w: 780, h: 235 }, from: 278.8, to: 280.9 }] }),
      seg('owner', 132.2, 136.1, { caption: 'Risk-aware execution: deterministic checks the model cannot override', camera: [{ at: 132.2, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 132.45, mark: 'rejected-checks' }], highlights: [{ mark: 'rejected-checks', from: 132.4, to: 136.0 }] }),
      seg('raw', 539.4, 543.0, { caption: 'Owner override: emergency stop revokes the agent on-chain', camera: [{ at: 539.4, rect: RAW.controls }], highlights: [{ rect: RAW.alert, from: 539.6, to: 542.9 }] }),
      seg('explorer', 74.4, 79.4, { caption: 'Verifiable: the autonomous transfer on the public explorer', camera: [{ at: 74.4, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 74.8, to: 79.3 }] }),
      seg('audit', 12.2, 15.6, { caption: 'Auditable: every agent action in a verifiable hash chain', highlights: [{ rect: AUDIT.valid, from: 12.4, to: 15.5 }] }),
    ],
  },
  {
    id: '15-end-to-end', title: 'Complete end-to-end workflow', criterion: 'Task completion (40%) · Execution evidence · On-chain bonus', model: 'gpt-4.1-mini',
    segments: [
      seg('raw', 295.5, 299.4, { caption: '1 · User instruction', camera: [{ at: 295.5, rect: RAW.chat }], highlights: [{ rect: RAW.input, from: 295.8, to: 299.3 }] }),
      seg('raw', 303.6, 308.2, { caption: '2 · AI proposal (gpt-4.1-mini → schedule_payment)', camera: [{ at: 303.6, rect: RAW.chat }, { at: 304.4, rect: RAW.chatZoom }] }),
      seg('raw', 313.0, 316.8, { caption: '3 · Authorization: owner signs the bounded grant once (EIP-712)', camera: [{ at: 313, rect: RAW.task }] }),
      seg('owner', 151.3, 155.4, { caption: '4 · Policy check of the run: passed, route AUTO_GRANT', camera: [{ at: 151.3, rect: { x: 0, y: 0, w: 1920, h: 1080 } }, { at: 151.55, mark: 'task-runs' }], highlights: [{ mark: 'task-runs', from: 151.5, to: 155.3 }] }),
      seg('raw', 484.0, 488.4, { caption: '5 · Autonomous execution by the scheduler and agent key', camera: [{ at: 484, rect: RAW.task }] }),
      seg('explorer', 74.2, 79.8, { caption: '6 · Public blockchain confirmation', camera: [{ at: 74.2, rect: EXP.details }], highlights: [{ rect: EXP.rows, from: 74.6, to: 79.7, text: '0xedeb6b97…e3cec3 · Success' }] }),
      seg('receipts', 13.4, 17.2, { caption: '6 · Receipt re-verified independently over a public RPC', highlights: [{ rect: { x: 20, y: 930, w: 1840, h: 80 }, from: 13.6, to: 17.1 }] }),
      seg('audit', 12.0, 16.2, { caption: '7 · Audit record, hash-chained and verified', highlights: [{ rect: AUDIT.rows(16, 22), from: 12.2, to: 14.4 }, { rect: AUDIT.valid, from: 14.5, to: 16.1 }] }),
    ],
  },
];
