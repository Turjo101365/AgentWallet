const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * EIP-712 helpers mirroring backend/src/lib/approval.js and backend/src/lib/schedule.js exactly (same
 * domain names, version, types and field order), so these tests prove the contract accepts the
 * signatures the backend and MetaMask already produce.
 */
const APPROVE_TYPES = {
  ApproveTransfer: [
    { name: "proposalId", type: "string" },
    { name: "intentId", type: "bytes32" },
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const GRANT_TYPES = {
  AuthorizeTask: [
    { name: "taskId", type: "string" },
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amountPerRun", type: "uint256" },
    { name: "maxRuns", type: "uint256" },
    { name: "maxTotal", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "scheduleHash", type: "bytes32" },
    { name: "executionWindowSeconds", type: "uint256" },
  ],
};

let counter = 0;

async function domain(wallet, name, overrides = {}) {
  const { chainId } = await ethers.provider.getNetwork();
  return { name, version: "1", chainId, verifyingContract: await wallet.getAddress(), ...overrides };
}

/** Signs an ApproveTransfer; `domainOverrides` lets tests forge a wrong chain or contract. */
async function signApproval(wallet, signer, fields, domainOverrides = {}) {
  const approval = {
    proposalId: fields.proposalId ?? `proposal-${++counter}`,
    intentId: fields.intentId,
    token: fields.token,
    recipient: fields.recipient,
    amount: fields.amount,
    deadline: fields.deadline ?? (await time.latest()) + 3600,
  };
  const signature = await signer.signTypedData(await domain(wallet, "AgentWallet Operator Approval", domainOverrides), APPROVE_TYPES, approval);
  return { approval, signature };
}

async function signGrant(wallet, signer, fields, domainOverrides = {}) {
  const grant = {
    taskId: fields.taskId ?? `task-${++counter}`,
    token: fields.token,
    recipient: fields.recipient,
    amountPerRun: fields.amountPerRun,
    maxRuns: fields.maxRuns ?? 0,
    maxTotal: fields.maxTotal ?? 0,
    validUntil: fields.validUntil ?? (await time.latest()) + 86400,
    scheduleHash: fields.scheduleHash ?? ethers.id("schedule"),
    executionWindowSeconds: fields.executionWindowSeconds ?? 0,
  };
  const signature = await signer.signTypedData(await domain(wallet, "AgentWallet Task Authorization", domainOverrides), GRANT_TYPES, grant);
  return { grant, signature };
}

/**
 * The v2 replacement for the v1 `executeTransfer(intent, token, recipient, amount)` call: the wallet's
 * CURRENT owner signs an approval for exactly these fields and `walletAs`' signer submits it.
 */
async function agentTransfer(walletAs, intentId, token, recipient, amount) {
  const owner = await ethers.getSigner(await walletAs.owner());
  const { approval, signature } = await signApproval(walletAs, owner, { intentId, token, recipient, amount });
  return walletAs.executeApprovedTransfer(approval, signature);
}

module.exports = { APPROVE_TYPES, GRANT_TYPES, signApproval, signGrant, agentTransfer };
