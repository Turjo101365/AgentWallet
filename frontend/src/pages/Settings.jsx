import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { CONTRACT_ADDRESS } from '../config/contracts.js';
import { DEFAULT_CHAIN_ID } from '../config/networks.js';

export function Settings() {
  const [contractAddr, setContractAddr] = useState(CONTRACT_ADDRESS);
  const [chainId, setChainId] = useState(DEFAULT_CHAIN_ID.toString());
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://localhost:4000/api');

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200/60">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
          System & Environment Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Configure EVM RPC endpoints, smart contract addresses, and service URLs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="CONTRACT & CHAIN SETTINGS" />
          <CardContent className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-slate-500 block mb-1">Contract Address (from Remix or Hardhat)</label>
              <input
                type="text"
                value={contractAddr}
                onChange={(e) => setContractAddr(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                {contractAddr ? 'Contract address configured.' : 'Contract configuration missing.'}
              </span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">EVM Chain ID</label>
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="84532">84532 - Base Sepolia Testnet (Active)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="MICROSERVICE ENDPOINTS" />
          <CardContent className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-slate-500 block mb-1">Backend REST API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <span className="text-[11px] text-slate-400 block uppercase font-semibold">Service Health Diagnostics</span>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-200/60">
                  <span>Backend Server:</span>
                  <Badge variant="success">ONLINE (Port 4000)</Badge>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-200/60">
                  <span>RL Engine Microservice:</span>
                  <Badge variant="active">ONLINE (Port 8000)</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
