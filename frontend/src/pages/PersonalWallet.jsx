import React, { useState } from 'react';
import { useApp } from '../app/providers.jsx';
import { AccessGate } from '../components/wallet/AccessGate.jsx';
import { Card,CardContent } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { describeError } from '../lib/api.js';
export function PersonalWallet() {
  const { selectPersonal }=useApp();
  const [address,setAddress]=useState(''),[error,setError]=useState(null);
  return <AccessGate><Card><CardContent className="space-y-4"><h1 className="text-3xl">Connect your personal sandbox</h1>
    <p>Use an admin-registered, separate v2 sandbox that your signed-in wallet actually owns. You need Sepolia ETH for deposits and owner transactions; never share a private key.</p>
    <input className="field" aria-label="Your sandbox address" placeholder="0x… sandbox contract" value={address} onChange={(e)=>setAddress(e.target.value)}/>
    <Button onClick={async()=>{try{await selectPersonal(address);}catch(e){setError(describeError(e));}}}>Verify ownership and open dashboard</Button>
    {error&&<Alert variant="error">{error}</Alert>}
  </CardContent></Card></AccessGate>;
}
