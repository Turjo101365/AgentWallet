import React from 'react';
import { Alert } from '../ui/Alert.jsx';
import { useApp } from '../../app/providers.jsx';
import { explorerTx } from '../../lib/networks.js';
import { describeError } from '../../lib/api.js';

/** Renders the lifecycle of a wallet-signed transaction. Never claims success before the receipt. */
export function TxStatus({ tx }) {
  const { config } = useApp();
  if (!tx || tx.status === 'idle') return null;
  const link = explorerTx(config, tx.hash);
  const hash = tx.hash ? (
    <span className="font-mono break-all">
      {link ? (
        <a className="underline" href={link} target="_blank" rel="noreferrer">
          {tx.hash}
        </a>
      ) : (
        tx.hash
      )}
    </span>
  ) : null;

  if (tx.status === 'signing') return <Alert variant="warning" title={`${tx.label}: waiting for wallet signature`}>Confirm the request in your wallet.</Alert>;
  if (tx.status === 'pending') return <Alert variant="warning" title={`${tx.label}: submitted, waiting for confirmation`}>{hash}</Alert>;
  if (tx.status === 'confirmed') return <Alert variant="info" title={`${tx.label}: confirmed in block ${tx.blockNumber}`}>{hash}</Alert>;
  return (
    <Alert variant="error" title={`${tx.label}: failed`}>
      {describeError(tx.error)} {hash}
    </Alert>
  );
}
