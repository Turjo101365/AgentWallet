import { useCallback, useState } from 'react';
import { Contract } from 'ethers';
import { useApp } from '../app/providers.jsx';
import { post } from '../lib/api.js';

/**
 * Sends an owner transaction to the AgentWallet contract through the user's wallet and tracks it
 * honestly: signing -> pending (hash known) -> confirmed / failed (receipt). Success is only shown
 * after the receipt; the backend then verifies and indexes the hash from the chain.
 */
export function useOwnerTx() {
  const { config, getSigner } = useApp();
  const [state, setState] = useState({ status: 'idle', hash: null, error: null, label: null });

  const send = useCallback(
    async (label, build) => {
      setState({ status: 'signing', hash: null, error: null, label });
      try {
        const signer = await getSigner();
        const wallet = new Contract(config.contractAddress, config.abi, signer);
        const tx = await build({ signer, wallet });
        setState({ status: 'pending', hash: tx.hash, error: null, label });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error(`Transaction ${tx.hash} reverted`);
        try {
          await post('/transactions/track', { txHash: tx.hash });
        } catch {
          /* indexing is a hint; the indexer will still pick the event up */
        }
        setState({ status: 'confirmed', hash: tx.hash, error: null, label, blockNumber: receipt.blockNumber });
        return receipt;
      } catch (err) {
        setState((s) => ({ status: 'failed', hash: s.hash, error: err, label }));
        return null;
      }
    },
    [config, getSigner],
  );

  const reset = useCallback(() => setState({ status: 'idle', hash: null, error: null, label: null }), []);
  return { ...state, send, reset };
}
