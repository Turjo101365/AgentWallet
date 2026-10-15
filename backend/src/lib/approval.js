import { ethers } from 'ethers';

/**
 * EIP-712 typed data the operator signs to approve one specific transfer. The signature binds the
 * proposal id, on-chain intent id, chain, contract, token, recipient, exact amount and deadline, so
 * an approval can never be replayed for a different transfer, chain or contract.
 */
export const APPROVAL_TYPES = {
  ApproveTransfer: [
    { name: 'proposalId', type: 'string' },
    { name: 'intentId', type: 'bytes32' },
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export function approvalTypedData(proposal) {
  return {
    domain: {
      name: 'AgentWallet Operator Approval',
      version: '1',
      chainId: proposal.chainId,
      verifyingContract: proposal.contractAddress,
    },
    types: APPROVAL_TYPES,
    primaryType: 'ApproveTransfer',
    message: {
      proposalId: proposal.id,
      intentId: proposal.intentId,
      token: proposal.token.address,
      recipient: proposal.recipient,
      amount: proposal.amountWei,
      deadline: String(proposal.expiresAt),
    },
  };
}

export function recoverApprover(proposal, signature) {
  const { domain, types, message } = approvalTypedData(proposal);
  return ethers.verifyTypedData(domain, types, message, signature);
}

/** Deterministic on-chain intent id: unique per chain, contract and proposal. */
export function intentIdFor({ chainId, contractAddress, proposalId }) {
  return ethers.keccak256(ethers.toUtf8Bytes(`agentwallet:intent:${chainId}:${contractAddress.toLowerCase()}:${proposalId}`));
}
