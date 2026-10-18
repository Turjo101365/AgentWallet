// Local-only browser smoke: starts its own Hardhat chain and memory database.
// Uses intentionally public development wallets; never reads funded signers or paid AI credentials.
// Run from the repository root after installing backend, frontend and contracts dependencies.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {ethers} from '../backend/node_modules/ethers/lib.esm/index.js';
import {startTestChain,deployFixture} from '../backend/test/helpers/chain.js';
import {buildTestApp,signIn} from '../backend/test/helpers/app.js';
const require=createRequire(import.meta.url),{chromium}=require('../frontend/node_modules/@playwright/test');
let chain,ctx,server,vite,browser,page;
try{
 chain=await startTestChain();const fx=await deployFixture(chain.provider);
 await(await fx.wallet.withdraw(ethers.ZeroAddress,fx.owner.address,ethers.parseEther('4.9996'))).wait();
 await(await fx.wallet.setRecipient(fx.payeeB.address,true)).wait();
 ctx=await buildTestApp({rpcUrl:chain.rpcUrl,deployment:fx.deployment,env:{APP_ORIGIN:'http://127.0.0.1:5184',CORS_ORIGINS:'http://127.0.0.1:5184',NATIVE_RESERVE_FLOOR_ETH:'0'}});
 const token=await signIn(ctx.app,fx.owner);
 server=await new Promise(resolve=>{const s=ctx.app.listen(4207,'127.0.0.1',()=>resolve(s));});
 vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5184'],{cwd:process.cwd()+'/frontend',env:{...process.env,VITE_API_URL:'http://127.0.0.1:4207/api',VITE_APP_MODE:'operator'},stdio:'ignore',windowsHide:true});
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5184')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('__localWallet',async({method,params})=>{if(['eth_accounts','eth_requestAccounts'].includes(method))return[fx.owner.address];if(method==='eth_chainId')return'0x7a69';if(method==='eth_signTypedData_v4'){const d=JSON.parse(params[1]);delete d.types.EIP712Domain;return fx.owner.signTypedData(d.domain,d.types,d.message);}if(method==='eth_sendTransaction')throw Error('Owner transaction submission disabled in this local UI check');return chain.provider.send(method,params||[]);});
 await page.addInitScript(({token,address})=>{sessionStorage.setItem('aw.session',JSON.stringify({token,address,role:'owner',expiresAt:Math.floor(Date.now()/1000)+3600}));window.ethereum={request:p=>window.__localWallet(p),on(){},removeListener(){}};},{token,address:fx.owner.address});
 await page.goto('http://127.0.0.1:5184/treasury');await page.getByRole('heading',{name:'Protect what you need.'}).waitFor();
 await page.getByLabel('Minimum ETH balance').fill('0.0002');await page.getByRole('button',{name:'Save protected balance'}).click();await page.getByTestId('Protected balance').filter({hasText:'0.0002 ETH'}).waitFor();
 const due=new Date(Date.now()+86400000).toISOString().slice(0,16);
 for(const [label,address,amount,priority]of [['Urgent supplier',fx.payeeA.address,'0.0001','HIGH'],['Later supplier',fx.payeeB.address,'0.0002','NORMAL']]){await page.getByLabel('Recipient label',{exact:true}).fill(label);await page.getByLabel('Approved recipient address').fill(address);await page.getByLabel('Amount in ETH').fill(amount);await page.getByLabel('Due date and time').fill(due);await page.getByLabel('Priority',{exact:true}).selectOption(priority);await page.getByRole('button',{name:'Add obligation',exact:true}).click();await page.getByRole('heading',{name:new RegExp(label+' ·')}).first().waitFor();}
 await page.getByText(/Later supplier.*Defer/).waitFor();
 const viewports=[];for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)console.log(JSON.stringify({width,overflowElements:await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='absolute').slice(0,15).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),width:e.getBoundingClientRect().width})))}));assert.equal(overflow,false,'Overflow at '+width);viewports.push({width,overflow});await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).fontSize)>=16),true);await page.screenshot({path:`work/treasury-local-${width}.png`,fullPage:true});}
 await page.getByRole('link',{name:'Prioritize my upcoming payments',exact:true}).click();assert.equal(await page.getByPlaceholder('Ask your AI assistant…').inputValue(),'Prioritize my upcoming payments');
 await page.goto('http://127.0.0.1:5184/treasury');await page.getByRole('button',{name:'Prepare for review',exact:true}).click();await page.getByRole('button',{name:'Confirm in wallet',exact:true}).click();await ctx.container.executor.whenIdle();
 // The UI polls its real local backend for the final outcome.
 await page.getByText('Payment confirmed — receipt verified',{exact:false}).waitFor({timeout:30000});
 await page.goto('http://127.0.0.1:5184/treasury');await page.getByText('Paid — verified receipt').waitFor();await page.getByRole('button',{name:'Check payment policy'}).click();await page.getByText('Payment was not authorized').waitFor();
 assert.deepEqual(errors,[]);const obligations=await ctx.container.treasury.list({address:fx.owner.address});const paid=obligations.find(x=>x.status==='PAID');assert.ok(paid.txHash);assert.equal((await chain.provider.getTransactionReceipt(paid.txHash)).status,1);
 const report={environment:'LOCAL Hardhat chain 31337; public development wallets; no paid AI',viewports,reserve:'0.0002 ETH',initialBalance:'0.0004 ETH',paidAmount:'0.0001 ETH',verifiedLocalTransaction:paid.txHash,secondPayment:'Blocked by BALANCE_AND_RESERVE',aiPromptHandoff:true,errors};fs.writeFileSync('work/treasury-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page?.screenshot({path:'work/treasury-local-failure.png',fullPage:true}).catch(()=>{});console.error('Local treasury browser check: '+e.message.split('\n')[0]);process.exitCode=1;}finally{await browser?.close();vite?.kill();await new Promise(r=>server?server.close(r):r());await ctx?.container.close();await chain?.stop();}
