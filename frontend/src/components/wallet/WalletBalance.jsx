import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { formatEth, formatUsd } from '../../utils/formatters.js';

export function WalletBalance({ balanceEth = null, ethUsdPrice = null, isConfigured = false }) {
  const hasBalance = balanceEth !== null && isConfigured;
  const usdValue = hasBalance && ethUsdPrice ? balanceEth * ethUsdPrice : null;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader
        title="TREASURY VAULT & NATIVE BALANCE"
        badge={
          isConfigured ? (
            <Badge variant="success" pulse>
              Connected (Base Sepolia)
            </Badge>
          ) : (
            <Badge variant="warning">
              Not connected
            </Badge>
          )
        }
      />
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">
            {hasBalance ? formatEth(balanceEth, 4) : '—'}
          </span>
          <span className="font-mono text-lg font-semibold text-slate-500">ETH</span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-sm font-medium text-slate-600">
            {usdValue !== null ? formatUsd(usdValue) : 'Data unavailable'}
          </span>
          {hasBalance ? (
            <span className="inline-flex items-center text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              Base Sepolia Native
            </span>
          ) : (
            <span className="inline-flex items-center text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              Awaiting Provider
            </span>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-slate-400">candlestick_chart</span>
            Base Sepolia #84532
          </span>
          <span>{hasBalance ? 'Live On-Chain' : 'Not connected'}</span>
        </div>
      </CardContent>
    </Card>
  );
}
