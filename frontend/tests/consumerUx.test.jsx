// Presentation checks use explicit fixtures. No live model or blockchain calls.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppContext } from '../src/app/providers.jsx';
import { ProposalCard } from '../src/components/proposals/ProposalCard.jsx';
import { PrimaryNav } from '../src/components/layout/Sidebar.jsx';
import { Overview } from '../src/pages/Overview.jsx';
import { AppLayout } from '../src/components/layout/AppLayout.jsx';
import { configureApi } from '../src/lib/api.js';

const fixtures=vi.hoisted(()=>({wallet:null,transactions:[],proposals:[],tasks:[],budget:null}));
vi.mock('../src/hooks/useData.js',()=>({
  useWalletState:()=>({data:fixtures.wallet}), useAgentStatus:()=>({data:{llm:{available:true,model:'gpt-4.1-mini'}}}),
  useRecipients:()=>({data:[]}), useProposals:()=>({data:fixtures.proposals}), useTransactions:()=>({data:fixtures.transactions}),
  useAuditLog:()=>({data:[]}),useAuditVerify:()=>({data:{valid:true,entries:0}}),useTasks:()=>({data:fixtures.tasks}),usePolicy:()=>({data:{}}),labelFor:()=>null,
}));
vi.mock('../src/hooks/usePolling.js',()=>({usePolling:()=>({data:fixtures.budget})}));

const ETH='0x0000000000000000000000000000000000000000';
const recipient='0xd85cdB676877ccdc8873B63DEf51B456568604F5';
const config={isPublicNetwork:true,networkName:'Ethereum Sepolia',chainId:11155111,contractAddress:'0x59a33154288009e030aa2072De46D32fC7d40d85',explorerBaseUrl:'https://sepolia.etherscan.io',tokens:[{symbol:'ETH',address:ETH,decimals:18}]};
const proposal=()=>({id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',status:'AWAITING_APPROVAL',source:'AGENT',token:config.tokens[0],recipient,amountFormatted:'0.0001',amountWei:'100000000000000',expiresAt:Math.floor(Date.now()/1000)+300,simulation:{success:true,maxNetworkFeeEth:'0.00000000003'},policyResult:{passed:true,checks:[]},demo:{mine:true}});
const mount=(ui,over={})=>render(<MemoryRouter><AppContext.Provider value={{config,isDemo:true,isOwner:false,judgeSite:true,demo:{executionAllowed:true},...over}}>{ui}</AppContext.Provider></MemoryRouter>);
beforeEach(()=>{
  configureApi({getToken:()=>null,getPrefix:()=>'',unauthorized:()=>{}});
  fixtures.wallet={paused:false,executorBalanceEth:'0.0015',executorIsOnChainAgent:true,blockNumber:10,tokens:[{address:ETH,symbol:'ETH',enabled:true,native:true,decimals:18,dailyLimit:'300000000000000',spentToday:'100000000000000',formatted:{balance:'0.0004',perTxLimit:'0.0001',dailyLimit:'0.0003',spentToday:'0.0001'}}]};
  fixtures.proposals=[];fixtures.transactions=[];fixtures.tasks=[];fixtures.budget=null;
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('consumer payment review',()=>{
  it('shows the full destination, network, honest fee and demo custody before confirmation',()=>{
    mount(<ProposalCard proposal={proposal()}/>);
    expect(screen.getByRole('region',{name:'Payment review'})).toBeTruthy();
    expect(screen.getByText(recipient,{exact:true})).toBeTruthy();
    expect(screen.getByText('<0.00000001 ETH')).toBeTruthy();
    expect(screen.getByText(/backend-controlled demo wallet signs this exact payment/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Confirm demo payment'}).disabled).toBe(true);
  });
  it('canceling review makes no request and resets confirmation when reopened',()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mount(<ProposalCard proposal={proposal()}/>);
    fireEvent.click(screen.getByTestId('demo-confirm-checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));
    expect(screen.queryByRole('button',{name:'Confirm demo payment'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Review payment'}));
    expect(screen.getByRole('button',{name:'Confirm demo payment'}).disabled).toBe(true);expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps explore mode blocked and explains that a new invited session needs a new draft',()=>{
    mount(<ProposalCard proposal={proposal()}/>,{demo:{executionAllowed:false}});
    expect(screen.getByText(/Ask the team for a live-demo invite/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Confirm demo payment'})).toBeNull();
  });
  it('posts the unchanged exact confirmation and shows success only with the returned receipt',async()=>{
    const p=proposal(),hash='0x'+'ab'.repeat(32),fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({success:true,data:{...p,status:'CONFIRMED',receipt:{status:1,blockNumber:12,gasUsed:'12345',txHash:hash,explorerUrl:'https://sepolia.etherscan.io/tx/'+hash}}})}));vi.stubGlobal('fetch',fetch);
    mount(<ProposalCard proposal={p}/>);expect(screen.queryByTestId('demo-receipt')).toBeNull();fireEvent.click(screen.getByTestId('demo-confirm-checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm demo payment'}));
    await screen.findByTestId('demo-receipt');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({confirm:true,recipient,amountWei:'100000000000000'});
    expect(screen.getByRole('link',{name:/View verified Sepolia receipt/}).getAttribute('href')).toBe('https://sepolia.etherscan.io/tx/'+hash);
  });
  it('a receipt from a local simulation chain is labelled SIMULATED, never as Sepolia evidence',async()=>{
    const p=proposal(),hash='0x'+'cd'.repeat(32),fetch=vi.fn(async()=>({ok:true,status:200,json:async()=>({success:true,data:{...p,status:'CONFIRMED',receipt:{status:1,blockNumber:12,gasUsed:'12345',txHash:hash,explorerUrl:null}}})}));vi.stubGlobal('fetch',fetch);
    mount(<ProposalCard proposal={p}/>,{config:{...config,isPublicNetwork:false,networkName:'Hardhat Local',chainId:31337,explorerBaseUrl:null}});
    fireEvent.click(screen.getByTestId('demo-confirm-checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm demo payment'}));
    const receipt=await screen.findByTestId('demo-receipt');
    expect(receipt.textContent).toMatch(/SIMULATED/);expect(receipt.textContent).toMatch(/not public evidence/);expect(receipt.textContent).not.toMatch(/Sepolia/);
  });
});

describe('homepage and navigation',()=>{
  it('waits for selected-wallet configuration before mounting dashboard pages on a refresh',()=>{
    mount(<AppLayout/>,{config:null,mode:{role:'judge',wallet:'demo'},reloadConfig:vi.fn(),resetMode:vi.fn()});
    expect(screen.getByRole('heading',{name:'Opening your wallet…'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Available balance'})).toBeNull();
    expect(screen.getByRole('link',{name:'View historical evidence'})).toBeTruthy();
  });
  it('offers a retry after a configuration error without mounting a wrong-wallet dashboard',()=>{
    const reloadConfig=vi.fn();mount(<AppLayout/>,{config:null,configError:'offline',mode:{role:'judge',wallet:'demo'},reloadConfig,resetMode:vi.fn()});
    fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(reloadConfig).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading',{name:'Available balance'})).toBeNull();
  });
  it('shows real balances and remaining allowance, and separates contract rules from demo access budgets',()=>{
    mount(<Overview/>);
    expect(screen.getByRole('heading',{name:/Your money, under your control/})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Available balance'})).toBeTruthy();
    expect(screen.getByText('0.0004',{exact:true})).toBeTruthy();
    expect(screen.getByText('0.0002',{exact:false})).toBeTruthy();
    expect(screen.getByText(/Demo access budget — separate from the contract/)).toBeTruthy();
    expect(screen.getByText(/No payments need your approval/)).toBeTruthy();
  });
  it('does not display a false zero or caught-up message while payment data is loading',()=>{
    fixtures.proposals=null;fixtures.transactions=null;mount(<Overview/>);
    expect(screen.getByText('Loading payments…')).toBeTruthy();
    expect(screen.queryByText(/No payments need your approval/)).toBeNull();
  });
  it('has labeled navigation and keeps evidence separate',()=>{
    mount(<PrimaryNav/>);
    for(const name of ['Home','AI Assistant','Payments','Automations','Security','Settings','Evidence'])expect(screen.getByRole('link',{name}).textContent).toContain(name);
  });
});
