import React, { useState } from 'react';
import { Contract, parseUnits, isAddress } from 'ethers';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { BalancesCard } from '../components/wallet/BalancesCard.jsx';
import { TxStatus } from '../components/wallet/TxStatus.jsx';
import { useApp } from '../app/providers.jsx';
import { useWalletState } from '../hooks/useData.js';
import { useOwnerTx } from '../hooks/useOwnerTx.js';

const ERC20 = ['function transfer(address to, uint256 amount) returns (bool)'];
const input = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary';
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

function toUnits(value, decimals) {
  if (!DECIMAL.test(value)) throw new Error('Enter a positive decimal amount, for example 0.5');
  const units = parseUnits(value, decimals);
  if (units <= 0n) throw new Error('Amount must be greater than zero');
  return units;
}

export function Treasury() {
  const { config, isOwner, account } = useApp();
  const wallet = useWalletState();
  const tx = useOwnerTx();
  const [depositToken, setDepositToken] = useState(config.tokens[0].address);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawToken, setWithdrawToken] = useState(config.tokens[0].address);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawTo, setWithdrawTo] = useState(account || '');
  const [formError, setFormError] = useState(null);
  const paused = Boolean(wallet.data?.paused);

  const tokenOf = (address) => config.tokens.find((t) => t.address === address);

  async function deposit(e) {
    e.preventDefault();
    setFormError(null);
    try {
      const t = tokenOf(depositToken);
      const units = toUnits(depositAmount, t.decimals);
      const receipt = await tx.send(`Deposit ${depositAmount} ${t.symbol}`, ({ signer, wallet: w }) =>
        t.native ? w.deposit({ value: units }) : new Contract(t.address, ERC20, signer).transfer(config.contractAddress, units),
      );
      if (receipt) {
        setDepositAmount('');
        wallet.refresh();
      }
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function withdraw(e, emergency) {
    e.preventDefault();
    setFormError(null);
    try {
      const t = tokenOf(withdrawToken);
      const units = toUnits(withdrawAmount, t.decimals);
      if (!isAddress(withdrawTo)) throw new Error('Destination must be a valid address');
      const label = `${emergency ? 'Emergency withdraw' : 'Withdraw'} ${withdrawAmount} ${t.symbol}`;
      const receipt = await tx.send(label, ({ wallet: w }) => (emergency ? w.emergencyWithdraw(t.address, withdrawTo, units) : w.withdraw(t.address, withdrawTo, units)));
      if (receipt) {
        setWithdrawAmount('');
        wallet.refresh();
      }
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Treasury</h1>
      <BalancesCard state={wallet.data} />
      <TxStatus tx={tx} />
      {formError && <Alert variant="error">{formError}</Alert>}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Deposit" subtitle="Anyone can fund the contract. Signed in your wallet." />
          <CardContent>
            <form onSubmit={deposit} className="space-y-3">
              <select className={input} value={depositToken} onChange={(e) => setDepositToken(e.target.value)}>
                {config.tokens.map((t) => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
              <input className={input} placeholder="Amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} inputMode="decimal" />
              <Button type="submit" disabled={['signing', 'pending'].includes(tx.status)} icon="south">Deposit</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Owner withdrawal" subtitle="Custodian only. Not limited by agent caps." />
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => withdraw(e, false)}>
              <select className={input} value={withdrawToken} onChange={(e) => setWithdrawToken(e.target.value)}>
                {config.tokens.map((t) => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
              <input className={input} placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} inputMode="decimal" />
              <input className={input} placeholder="Destination 0x…" value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} />
              <div className="flex gap-2 flex-wrap">
                <Button type="submit" disabled={!isOwner || ['signing', 'pending'].includes(tx.status)} icon="north">Withdraw</Button>
                <Button type="button" variant="danger" disabled={!isOwner || !paused || ['signing', 'pending'].includes(tx.status)} onClick={(e) => withdraw(e, true)} icon="emergency">
                  Emergency withdraw {paused ? '' : '(pause first)'}
                </Button>
              </div>
              {!isOwner && <p className="text-xs text-slate-500">Only the contract owner can withdraw.</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
