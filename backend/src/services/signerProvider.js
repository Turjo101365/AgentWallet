import { ethers } from 'ethers';

/**
 * Credential provider for the limited-authority executor. This is the only module that reads key
 * material. It is not reachable from the LLM tool surface, the API, the database or the browser.
 *
 * Supported sources (configured in config/env.js, exactly one at a time):
 *   dev-mnemonic  Hardhat public dev account (local chain 31337 only)
 *   env-key       AGENT_PRIVATE_KEY environment variable (plaintext in process env; least preferred)
 *   keystore      encrypted JSON keystore (scrypt) + password file; decrypted in memory at start-up
 *
 * Deployment environments with a KMS/HSM can add a source here that returns an ethers Signer
 * without the key ever entering the process.
 */
export async function createSignerProvider(config) {
  const source = config.executor.source;
  if (!source?.kind) return { kind: null, address: null, connect: () => null };

  let wallet;
  if (source.kind === 'dev-mnemonic' || source.kind === 'env-key') {
    wallet = new ethers.Wallet(source.secret);
  } else if (source.kind === 'keystore') {
    wallet = await ethers.Wallet.fromEncryptedJson(source.secret.json, source.secret.password);
  } else {
    throw new Error(`Unknown executor credential source ${source.kind}`);
  }
  if (config.executor.address && wallet.address !== config.executor.address) {
    throw new Error('Decrypted executor key does not match the configured address');
  }
  return {
    kind: source.kind,
    address: wallet.address,
    /** Returns a signer bound to the provider. The key never leaves this closure. */
    connect: (provider) => wallet.connect(provider),
  };
}
