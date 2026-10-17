import { ethers } from 'ethers';
import { AppError } from '../lib/errors.js';

/** All demo/personal containers share this durable relay gate and conservative daily GAS reservations. */
export function createRelayGuard({ db, demo, settingsDb }) {
  const deny = (code, message) => { throw new AppError(429, code, message); };
  return function bind(container, subjectFor) {
    const { chain, repos, config } = container;
    async function finish(id) {
      const execution = await repos.executions.findByProposal(id);
      const claim = (await db.query('SELECT * FROM sandbox_relay_claims WHERE proposal_id=$1', [id])).rows[0];
      if (!claim || claim.finished) return;
      const hash = claim.tx_hash || execution?.txHash;
      if (hash) {
        const receipt = await chain.provider.getTransactionReceipt(hash);
        if (!receipt) return; // Unknown outcome holds the gate; never free gas/budgets on a timeout.
      } else if (execution?.status !== 'FAILED') return;
      await db.tx(async (q) => {
        await q.query('UPDATE sandbox_relay_claims SET finished=TRUE WHERE proposal_id=$1', [id]);
        await q.query('UPDATE sandbox_relay_gate SET proposal_id=NULL WHERE id=1 AND proposal_id=$1', [id]);
      });
    }
    return {
      complete: finish,
      async reserve(proposal, { maxCost }) {
        const limits=(await (settingsDb||db).query('SELECT limits FROM demo_settings WHERE id=1')).rows[0]?.limits||{};
        const subject = await subjectFor(proposal);
        if (!subject) deny('SANDBOX_CONFIRMATION_REQUIRED', 'An authorized sandbox confirmation is required');
        if (proposal.token.address!==ethers.ZeroAddress || BigInt(proposal.amountWei)>ethers.parseEther(limits.maxAmountEth || ethers.formatEther(demo.maxAmountWei))) deny('SANDBOX_AMOUNT_LIMIT','Payment exceeds the approved ceiling');
        const snapshot=await chain.getSnapshot(),native=snapshot.tokens.find((t)=>t.native);
        if (!native || native.balance-BigInt(proposal.amountWei)<ethers.parseEther(limits.minTreasuryEth||demo.minTreasuryEth)) deny('SANDBOX_RESERVE','Treasury reserve would be depleted');
        if (maxCost > ethers.parseEther(limits.maxGasPerTxEth||ethers.formatEther(demo.maxGasPerTxWei))) deny('SANDBOX_GAS_LIMIT', 'Estimated transaction fee exceeds the sandbox gas budget');
        const balance = await chain.provider.getBalance(config.executor.address);
        if (balance - maxCost < ethers.parseEther(limits.minAgentGasEth||demo.minAgentGasEth)) deny('SANDBOX_GAS_RESERVE', 'Relay gas reserve would be depleted');
        await db.tx(async (q) => {
          const claim = await q.query('UPDATE sandbox_relay_gate SET proposal_id=$1 WHERE id=1 AND proposal_id IS NULL RETURNING id', [proposal.id]);
          if (!claim.rows.length) deny('SANDBOX_RELAY_BUSY', 'Another transaction has an unresolved outcome; wait for its receipt');
          await q.query('INSERT INTO sandbox_relay_claims(proposal_id,subject,contract_address,gas_wei) VALUES($1,$2,$3,$4)', [proposal.id,subject,config.contractAddress,maxCost.toString()]);
          for (const [key, count, gas] of [['global',limits.dailyTxLimit ?? demo.dailyTxLimit,ethers.parseEther(limits.dailyGasEth||ethers.formatEther(demo.dailyGasWei))], [subject,limits.maxTxPerSession ?? demo.maxTxPerSession,ethers.parseEther(limits.sessionGasEth||ethers.formatEther(demo.sessionGasWei))]]) {
            const r = await q.query(`INSERT INTO sandbox_relay_usage(day,subject,tx_count,gas_wei)
              SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,$1,1,$2 WHERE $3>=1 AND $2::numeric<=$4
              ON CONFLICT(day,subject) DO UPDATE SET tx_count=sandbox_relay_usage.tx_count+1,gas_wei=sandbox_relay_usage.gas_wei+$2
              WHERE sandbox_relay_usage.tx_count<$3 AND sandbox_relay_usage.gas_wei+$2<=$4 RETURNING tx_count`, [key,maxCost.toString(),count,gas.toString()]);
            if (!r.rows.length) deny('SANDBOX_RELAY_QUOTA', 'The persistent transaction or gas budget has been reached');
          }
        });
      },
      async submitted(id, hash) { await db.query('UPDATE sandbox_relay_claims SET tx_hash=$2 WHERE proposal_id=$1', [id,hash]); },
    };
  };
}
