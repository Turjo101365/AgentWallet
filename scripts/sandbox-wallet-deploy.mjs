// Local, public-data-only MetaMask handoff. This process never loads a private key.
// Fixed Sepolia funding account, constructor, recipients and allocation ceilings.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(ROOT,'backend/package.json'));
const {ethers}=require('ethers'),dotenv=require('dotenv');
const E=ethers.parseEther;
const FUNDING=ethers.getAddress('0x74B7a41E3f4949315364DAd08e1142b38870825b');
const RECIPIENT=ethers.getAddress('0xd85cdB676877ccdc8873B63DEf51B456568604F5');
const FROZEN=new Set(['0x3C9389E704331B8a12381F9ab5A68a7F3F59582F','0x8A44716Efabb6Ce401291B91D4427149CaF956a6','0x23bAE3f3C95f9BF7391c0764B1A7dFF700f34458'].map(x=>x.toLowerCase()));
const pub=JSON.parse(fs.readFileSync(path.join(ROOT,'secrets/interactive-sandbox-public.json')));
if(pub.chainId!==11155111 || pub.owner===pub.agent || [pub.owner,pub.agent].some(x=>FROZEN.has(x.toLowerCase())))throw Error('Invalid sandbox identities');
const env=dotenv.parse(fs.readFileSync(path.join(ROOT,'backend/.env.sepolia')));
const rpcRequest=new ethers.FetchRequest(env.RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com');rpcRequest.timeout=15000;
const provider=new ethers.JsonRpcProvider(rpcRequest,11155111,{staticNetwork:true});
const artifact=JSON.parse(fs.readFileSync(path.join(ROOT,'contracts/artifacts/src/AgentWallet.sol/AgentWallet.json')));
const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode);
const deployData=(await factory.getDeployTransaction(pub.owner,pub.agent,E('0.0001'),E('0.0003'))).data;
const progressFile=path.join(ROOT,'work/interactive-wallet-progress.json');
const descriptor=path.join(ROOT,'contracts/deployments/sepolia-demo.json');
let progress=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile)): {chainId:11155111,funding:FUNDING,owner:pub.owner,agent:pub.agent,recipient:RECIPIENT,receipts:[]};
if(progress.funding!==FUNDING || progress.owner!==pub.owner || progress.agent!==pub.agent)throw Error('Progress identity mismatch');
let pending=null,busy=false;
const token=crypto.randomBytes(32).toString('hex');
const save=()=>{fs.mkdirSync(path.dirname(progressFile),{recursive:true});fs.writeFileSync(progressFile,JSON.stringify(progress,null,2)+'\n');};
const hex=v=>ethers.toQuantity(v);
const spent=()=>progress.receipts.reduce((sum,r)=>sum+BigInt(r.feeWei),0n);
function step(){
  if(!progress.receipts.length)return {name:'Deploy unchanged AgentWallet v2',data:deployData,value:0n};
  if(progress.receipts.length===1)return {name:'Fund dedicated owner gas',to:pub.owner,data:'0x',value:E('0.0015')};
  if(progress.receipts.length===2)return {name:'Fund dedicated agent gas',to:pub.agent,data:'0x',value:E('0.0015')};
  if(progress.receipts.length===3)return {name:'Deposit sandbox treasury',to:progress.contractAddress,data:new ethers.Interface(artifact.abi).encodeFunctionData('deposit'),value:E('0.0005')};
  return null;
}
async function prepare(){
  if(pending)return pending;
  if(BigInt(await provider.send('eth_chainId',[]))!==11155111n)throw Error('Wrong RPC chain');
  const s=step();if(!s)return {complete:true};
  if(s.to&&FROZEN.has(s.to.toLowerCase()))throw Error('Frozen evidence target refused');
  const request={from:FUNDING,...(s.to?{to:s.to}:{}),data:s.data,value:s.value};
  const [gas,fees,balance]=await Promise.all([provider.estimateGas(request),provider.getFeeData(),provider.getBalance(FUNDING)]);
  const gasLimit=(gas*120n+99n)/100n,maxFee=fees.maxFeePerGas||fees.gasPrice,priority=fees.maxPriorityFeePerGas||0n;
  if(!maxFee || spent()+gasLimit*maxFee>E('0.0200'))throw Error('Deployment/configuration gas ceiling would be exceeded; stop for approval');
  if(balance<s.value+gasLimit*maxFee)throw Error('Funding wallet has insufficient Sepolia ETH');
  if(spent()+gasLimit*maxFee+E('0.0035')>E('0.0235'))throw Error('Total approved allocation would be exceeded');
  const tx={...request,value:hex(s.value),gas:hex(gasLimit),maxFeePerGas:hex(maxFee),maxPriorityFeePerGas:hex(priority),chainId:'0xaa36a7'};
  pending={index:progress.receipts.length,name:s.name,transaction:tx,estimateGas:gas.toString(),maxFeeEth:ethers.formatEther(gasLimit*maxFee),valueEth:ethers.formatEther(s.value)};
  console.log(JSON.stringify({event:'unsigned-wallet-request',step:pending.name,valueEth:pending.valueEth,maxFeeEth:pending.maxFeeEth}));
  return pending;
}
async function record(hash){
  if(!pending || !/^0x[0-9a-f]{64}$/i.test(hash))throw Error('No prepared request or invalid hash');
  const tx=await provider.getTransaction(hash);if(!tx)throw Error('Transaction is not visible yet; retry recording the same hash');
  const wanted=pending.transaction;
  if(tx.chainId!==11155111n || tx.from!==FUNDING || (tx.to||null)!==(wanted.to||null) || tx.data.toLowerCase()!==wanted.data.toLowerCase() || tx.value!==BigInt(wanted.value) || tx.gasLimit>BigInt(wanted.gas) || (tx.maxFeePerGas||tx.gasPrice)>BigInt(wanted.maxFeePerGas))throw Error('Signed transaction differs from reviewed request; STOP');
  const receipt=await provider.getTransactionReceipt(hash);if(!receipt)return {pending:true,hash};
  const fee=receipt.gasUsed*receipt.gasPrice;
  if(spent()+fee>E('0.0200'))throw Error('Actual fee ceiling exceeded; STOP');
  if(receipt.status!==1)throw Error('Transaction reverted; STOP and inspect hash '+hash);
  if(pending.index===0){
    if(!receipt.contractAddress || FROZEN.has(receipt.contractAddress.toLowerCase()))throw Error('Invalid new deployment address');
    const c=new ethers.Contract(receipt.contractAddress,artifact.abi,provider);
    if(Number(await c.VERSION())!==2 || await c.owner()!==pub.owner || await c.agent()!==pub.agent)throw Error('New contract identity check failed');
    if(fs.existsSync(descriptor))throw Error('Deployment descriptor exists; refusing overwrite');
    progress.contractAddress=receipt.contractAddress;
    fs.writeFileSync(descriptor,JSON.stringify({network:'sepolia-demo',chainId:11155111,contractAddress:receipt.contractAddress,contractVersion:2,deployBlock:receipt.blockNumber,deployTxHash:hash,owner:pub.owner,agent:pub.agent,tokens:[{symbol:'ETH',address:ethers.ZeroAddress,decimals:18,native:true}],demoRecipients:[{label:'Approved sandbox payment recipient',category:'supplier',address:RECIPIENT}],priceFeeds:[],deployedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  }
  progress.receipts.push({step:pending.name,hash,blockNumber:receipt.blockNumber,feeWei:fee.toString(),valueWei:tx.value.toString()});save();pending=null;
  console.log(JSON.stringify({event:'verified-wallet-receipt',hash,contractAddress:progress.contractAddress,complete:!step()}));
  return {confirmed:true,hash,complete:!step(),contractAddress:progress.contractAddress};
}
const html=String.raw`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentWallet — Sepolia deployment approval</title>
<style>body{font:16px/1.6 system-ui;background:#f4f4eb;color:#14251c;max-width:860px;margin:35px auto;padding:18px}button{background:#183e2b;color:white;border:0;border-radius:10px;padding:15px;margin:8px 8px 8px 0;font-size:16px;cursor:pointer}button:disabled{opacity:.4}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border-radius:15px}code{overflow-wrap:anywhere}.note{background:#fff1b8;padding:14px;border-radius:10px}</style>
<h1>AgentWallet · NEW Sepolia sandbox</h1><p class="note">Local deployment utility. Your key stays in MetaMask. Approve only Ethereum Sepolia, from the funding address below. Never enter a key or recovery phrase here. Keep MetaMask's prepared gas limits/fees; if it proposes different fees, reject and ask for a refreshed request.</p>
<p>Funding/admin: <code>${FUNDING}</code><br>NEW owner: <code>${pub.owner}</code><br>NEW agent: <code>${pub.agent}</code><br>Approved recipient: <code>${RECIPIENT}</code></p>
<p>Four separate approvals: (1) contract creation, no ETH value; (2) owner gas, 0.0015 ETH; (3) agent gas, 0.0015 ETH; (4) NEW treasury deposit, 0.0005 ETH. Gas plus funding must remain ≤0.0235 ETH. Historical evidence contract is never targeted.</p>
<button id="connect">1. Connect MetaMask</button><button id="review" disabled>2. Review next transaction</button><button id="approve" disabled>3. Request MetaMask approval</button><button id="retry" disabled>Check submitted receipt</button><pre id="out">Connect the approved funding wallet on Sepolia.</pre>
<script>
const out=document.querySelector('#out'),connect=document.querySelector('#connect'),review=document.querySelector('#review'),approve=document.querySelector('#approve'),retry=document.querySelector('#retry');
let wallet,prepared,hash,connected=false;
const show=x=>out.textContent=typeof x==='string'?x:JSON.stringify(x,null,2);
const detected=()=>window.ethereum?.providers?.find(p=>p.isMetaMask)||window.ethereum;
function providerStatus(){if(!connected)show(detected()?'Wallet provider detected. Connection handler ready. Click Connect MetaMask.':'No Ethereum provider detected yet. Enable MetaMask for this site, then click Connect MetaMask.');}
window.addEventListener('ethereum#initialized',providerStatus);
window.addEventListener('error',e=>{review.disabled=true;approve.disabled=true;show('JavaScript error: '+e.message);});
window.addEventListener('unhandledrejection',e=>{review.disabled=true;approve.disabled=true;show('Wallet script error: '+(e.reason?.message||'Unknown error'));});
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Deployment-Token':'${token}'},body:JSON.stringify(body||{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function fail(e){show(e.message||'Wallet request failed');review.disabled=!connected;approve.disabled=true;}
connect.onclick=async()=>{
  connected=false;review.disabled=true;approve.disabled=true;connect.disabled=true;
  show('Connect handler running. Detecting wallet provider…');
  try{
    wallet=detected();
    if(!wallet){await new Promise(resolve=>setTimeout(resolve,1000));wallet=detected();}
    if(!wallet||typeof wallet.request!=='function')throw Error('No Ethereum provider detected. Open this page in the Chrome profile with MetaMask, allow extension access to this site, and reload.');
    show('Provider detected. Requesting eth_requestAccounts. Check the MetaMask extension for a pending connection request.');
    const accounts=await wallet.request({method:'eth_requestAccounts'});
    if(accounts[0]?.toLowerCase()!=='${FUNDING.toLowerCase()}')throw Error('Select the approved funding account in MetaMask, then reconnect.');
    if(await wallet.request({method:'eth_chainId'})!=='0xaa36a7')await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});
    if(await wallet.request({method:'eth_chainId'})!=='0xaa36a7')throw Error('Sepolia is required. Select Sepolia, then reconnect.');
    connected=true;prepared=null;review.disabled=false;
    show('Connected to approved funding wallet on Sepolia. No transaction requested. Click Review next transaction when ready.');
  }catch(e){
    if(e.code===-32002)fail(Error('MetaMask already has a pending request. Open the extension and complete or reject it, then retry Connect MetaMask.'));
    else if(e.code===4001)fail(Error('You rejected the wallet connection. Click Connect MetaMask to retry.'));
    else fail(e);
  }finally{connect.disabled=false;}
};
providerStatus();
review.onclick=async()=>{try{prepared=await api('/prepare');show(prepared);approve.disabled=!!prepared.complete}catch(e){fail(e)}};approve.onclick=async()=>{approve.disabled=true;review.disabled=true;try{const accounts=await wallet.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!=='${FUNDING.toLowerCase()}'||await wallet.request({method:'eth_chainId'})!=='0xaa36a7')throw Error('Wallet/account changed. Reconnect and review again.');hash=await wallet.request({method:'eth_sendTransaction',params:[prepared.transaction]});show('Submitted: '+hash+'\nChecking receipt. Do not send a duplicate.');retry.disabled=false;await check()}catch(e){fail(e)}};async function check(){try{const r=await api('/record',{hash});show(r);if(r.confirmed){retry.disabled=true;review.disabled=r.complete;prepared=null;hash=null}else{setTimeout(check,4000)}}catch(e){show(e.message+'\nRecorded transaction hash: '+hash+'\nUse Check submitted receipt; do not send another transaction.')}}retry.onclick=check;</script></html>`;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.headers.host!=='127.0.0.1:4318')return json(403,{error:'Invalid local host'});
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
  if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:4318'||req.headers['x-deployment-token']!==token)return json(403,{error:'Local review session required'});
  if(busy)return json(409,{error:'Request already in progress'});busy=true;
  try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)throw Error('Request too large')};const body=JSON.parse(raw||'{}');if(req.url==='/prepare')return json(200,await prepare());if(req.url==='/record')return json(200,await record(body.hash));return json(404,{error:'Not found'});}catch(e){const safe=/ceiling|insufficient|Wrong RPC|Signed transaction|Invalid new|identity|descriptor exists|No prepared|reverted|visible yet/.test(e.message)?e.message:'Deployment request failed; no secrets logged';json(400,{error:safe});}finally{busy=false}
});
await new Promise(resolve=>server.listen(4318,'127.0.0.1',resolve));
console.log('MetaMask deployment page: http://127.0.0.1:4318 (public data only; no signing keys loaded)');
