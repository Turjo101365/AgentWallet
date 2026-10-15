const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Owner approved policy bounded swaps (local router fixture)', function () {
  async function fixture() {
    const [owner, agent, recipient] = await ethers.getSigners();
    const wallet = await (await ethers.getContractFactory('AgentWallet')).deploy(owner.address, agent.address, 1000, 1000);
    const Token = await ethers.getContractFactory('MockERC20');
    const a = await Token.deploy('A','A',6), b = await Token.deploy('B','B',6);
    const router = await (await ethers.getContractFactory('MockSwapRouter02')).deploy();
    await a.mint(wallet.target, 10000); await b.mint(router.target, 10000);
    await wallet.setTokenPolicy(a.target, true, 100, 250); await wallet.setTokenPolicy(b.target, true, 500, 1000);
    await wallet.setSwapRouter(router.target, true); await wallet.setRecipient(recipient.address, true);
    const params = { router: router.target, tokenIn: a.target, tokenOut: b.target, fee: 3000, amountIn: 100, amountOutMinimum: 190, deadline: await time.latest() + 300 };
    return {owner,agent,recipient,wallet,a,b,router,params};
  }
  it('executes real ERC20 movements, retains output, clears allowance and consumes shared cap/intent', async () => {
    const {wallet,a,b,router,params,agent,recipient} = await loadFixture(fixture);
    const id = ethers.id('swap');
    await expect(wallet.executeSwap(id, params)).to.emit(wallet,'SwapExecuted').withArgs(id,a.target,b.target,router.target,100,200);
    expect(await a.balanceOf(wallet.target)).to.equal(9900); expect(await b.balanceOf(wallet.target)).to.equal(200);
    expect(await a.allowance(wallet.target,router.target)).to.equal(0);
    expect(await wallet.spentPerDay(a.target,await wallet.currentDay())).to.equal(100);
    await expect(wallet.connect(agent).executeTransfer(id,a.target,recipient.address,1)).to.be.revertedWithCustomError(wallet,'IntentAlreadyExecuted');
    await wallet.connect(agent).executeTransfer(ethers.id('transfer'),a.target,recipient.address,100);
    await expect(wallet.executeSwap(ethers.id('overdaily'),params)).to.be.revertedWithCustomError(wallet,'DailyLimitExceeded');
  });
  it('agent cannot swap or authorize a router', async () => {
    const {wallet,agent,router,params} = await loadFixture(fixture);
    await expect(wallet.connect(agent).executeSwap(ethers.id('bad'),params)).to.be.revertedWithCustomError(wallet,'OwnableUnauthorizedAccount');
    await expect(wallet.connect(agent).setSwapRouter(router.target,true)).to.be.revertedWithCustomError(wallet,'OwnableUnauthorizedAccount');
  });
  it('rejects revoked router, disabled assets, zero floor, same asset, expiry and excessive deadline', async () => {
    const {wallet,router,a,params} = await loadFixture(fixture);
    for (const patch of [{amountOutMinimum:0},{tokenOut:a.target}]) await expect(wallet.executeSwap(ethers.id('invalid'),{...params,...patch})).to.be.revertedWithCustomError(wallet,'SwapNotAllowed');
    for (const deadline of [1,await time.latest()+3600]) await expect(wallet.executeSwap(ethers.id('expired'),{...params,deadline})).to.be.revertedWithCustomError(wallet,'SwapExpired');
    await wallet.setTokenPolicy(a.target,false,0,0);
    await expect(wallet.executeSwap(ethers.id('off'),params)).to.be.revertedWithCustomError(wallet,'TokenNotEnabled');
    await wallet.setSwapRouter(router.target,false);
    await expect(wallet.executeSwap(ethers.id('router'),params)).to.be.revertedWithCustomError(wallet,'SwapNotAllowed');
  });
  it('rejects fabricated router output and rolls back spend/intent/allowance/token transfers', async () => {
    const {wallet,router,a,b,params} = await loadFixture(fixture);
    await router.configure(200,true);
    const id=ethers.id('liar');
    await expect(wallet.executeSwap(id,params)).to.be.revertedWithCustomError(wallet,'InvalidSwapOutput');
    expect(await wallet.executedIntents(id)).to.equal(false); expect(await wallet.spentPerDay(a.target,await wallet.currentDay())).to.equal(0);
    expect(await a.allowance(wallet.target,router.target)).to.equal(0); expect(await a.balanceOf(wallet.target)).to.equal(10000); expect(await b.balanceOf(wallet.target)).to.equal(0);
    await router.configure(189,false);
    await expect(wallet.executeSwap(id,params)).to.be.revertedWithCustomError(wallet,'InvalidSwapOutput');
  });
  it('rejects replay, per-transaction overflow and paused execution', async () => {
    const {wallet,params}=await loadFixture(fixture);
    await expect(wallet.executeSwap(ethers.id('limit'),{...params,amountIn:101})).to.be.revertedWithCustomError(wallet,'PerTxLimitExceeded');
    await wallet.executeSwap(ethers.id('once'),params);
    await expect(wallet.executeSwap(ethers.id('once'),params)).to.be.revertedWithCustomError(wallet,'IntentAlreadyExecuted');
    await wallet.emergencyStop();
    await expect(wallet.executeSwap(ethers.id('paused'),params)).to.be.revertedWithCustomError(wallet,'EnforcedPause');
  });
});
