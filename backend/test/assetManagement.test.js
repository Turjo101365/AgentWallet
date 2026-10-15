import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { startTestChain, deployFixture, artifact } from './helpers/chain.js';
import { createChainService } from '../src/services/chainService.js';
import { createAssetManagementService } from '../src/services/assetManagementService.js';

describe('asset management service with local chain/router fixture', () => {
  let node, fx, config, chain, service, output, router;
  before(async () => {
    node = await startTestChain(); fx = await deployFixture(node.provider);
    const T = artifact('MockERC20','mocks'), R = artifact('MockSwapRouter02','mocks');
    output = await new ethers.ContractFactory(T.abi,T.bytecode,fx.ownerSigner).deploy('Output','OUT',6); await output.waitForDeployment();
    router = await new ethers.ContractFactory(R.abi,R.bytecode,fx.ownerSigner).deploy(); await router.waitForDeployment();
    await (await output.mint(router.target,100000)).wait();
    await (await fx.wallet.setTokenPolicy(output.target,true,1000,10000)).wait();
    await (await fx.wallet.setSwapRouter(router.target,true)).wait();
    config = { chainId:31337, network:{key:'localhost'}, rpcUrl:node.rpcUrl, contractAddress:fx.wallet.target, ownerCacheMs:0,
      executor:{address:fx.agent.address}, tokens:[...fx.deployment.tokens,{address:output.target,symbol:'OUT',decimals:6,native:false}],
      assetManagement:{router:router.target,quoter:router.target,maxGasPriceGwei:'100'} };
    chain = createChainService(config,{provider:node.provider}); await chain.verify();
    service=createAssetManagementService({config,chain});
  });
  after(async () => { await node?.stop(); });
  const input=()=>({tokenIn:fx.token.target,tokenOut:output.target,amount:'0.0001',fee:3000,slippageBps:50});
  test('prepares simulated exact owner calldata then executes ERC20 swap with receipt',async()=>{
    const prepared=await service.prepareSwap(input());
    assert.equal(prepared.quote.amountIn,'100'); assert.equal(prepared.quote.amountOutMinimum,'199');
    assert.equal(prepared.transaction.from,fx.owner.address); assert.equal(prepared.params.router,router.target);
    assert.equal(await fx.wallet.executedIntents(prepared.intentId),false);
    const receipt=await (await fx.ownerSigner.sendTransaction(prepared.transaction)).wait();
    assert.equal(receipt.status,1); assert.equal(await output.balanceOf(fx.wallet.target),200n);
    assert.equal(await fx.token.allowance(fx.wallet.target,router.target),0n);
  });
  test('rejects invalid assets, slippage, precision, fee and over-policy amounts',async()=>{
    for(const patch of [{tokenOut:ethers.ZeroAddress},{tokenOut:fx.token.target},{amount:'-1'},{amount:'0.0000001'},{amount:'101'},{fee:42},{slippageBps:101},{slippageBps:-1}])
      await assert.rejects(service.prepareSwap({...input(),...patch}),err=>err.status===400);
  });
  test('rejects bad router output during simulation and missing capability',async()=>{
    await (await router.configure(200,true)).wait();
    await assert.rejects(service.prepareSwap(input()),{code:'SWAP_SIMULATION_FAILED'});
    await (await router.configure(200,false)).wait();
    await (await fx.wallet.setSwapRouter(router.target,false)).wait();
    await assert.rejects(service.prepareSwap(input()),{code:'SWAP_CAPABILITY_UNAVAILABLE'});
    await (await fx.wallet.setSwapRouter(router.target,true)).wait();
  });
  test('requires configuration and bounds gas and aggregate rebalance spend',async()=>{
    await assert.rejects(createAssetManagementService({config:{},chain}).prepareSwap(input()),{code:'SWAPS_NOT_CONFIGURED'});
    await assert.rejects(createAssetManagementService({config:{...config,assetManagement:{...config.assetManagement,maxGasLimit:21000}},chain}).prepareSwap(input()),{code:'SWAP_GAS_POLICY_DENIED'});
    const result=await service.prepareRebalance({trades:[input(),input()]}); assert.equal(result.atomic,false); assert.equal(result.swaps.length,2);
    await assert.rejects(service.prepareRebalance({trades:[1,2,3].map(()=>({...input(),amount:'100'}))}),{code:'REBALANCE_POLICY_DENIED'});
  });
});
