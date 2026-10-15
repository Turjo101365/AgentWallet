const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentWallet Contract Unit Tests", function () {
  let agentWallet;
  let owner;
  let agent;
  let recipient;
  let unauthorized;

  const ONE_ETHER = ethers.parseEther("1.0");
  const DEFAULT_PER_TX_LIMIT = ethers.parseEther("0.01");
  const DEFAULT_DAILY_LIMIT = ethers.parseEther("0.05");

  beforeEach(async function () {
    [owner, agent, recipient, unauthorized] = await ethers.getSigners();

    const AgentWalletFactory = await ethers.getContractFactory("AgentWallet");
    agentWallet = await AgentWalletFactory.deploy();
    await agentWallet.waitForDeployment();

    // Set dedicated authorized agent
    await agentWallet.connect(owner).setAuthorizedAgent(agent.address);

    // Fund the wallet with 1 ETH
    await owner.sendTransaction({
      to: await agentWallet.getAddress(),
      value: ONE_ETHER,
    });
  });

  it("should initialize with correct owner, agent, and initial balance", async function () {
    expect(await agentWallet.owner()).to.equal(owner.address);
    expect(await agentWallet.authorizedAgent()).to.equal(agent.address);
    expect(await agentWallet.walletBalance()).to.equal(ONE_ETHER);
    expect(await agentWallet.perTransactionLimit()).to.equal(DEFAULT_PER_TX_LIMIT);
    expect(await agentWallet.dailySpendingLimit()).to.equal(DEFAULT_DAILY_LIMIT);
  });

  it("should allow authorized agent to execute payment within limits", async function () {
    const paymentAmount = ethers.parseEther("0.005");
    const initialRecipientBalance = await ethers.provider.getBalance(recipient.address);

    const tx = await agentWallet.connect(agent).executePayment(recipient.address, paymentAmount);
    await tx.wait();

    const finalRecipientBalance = await ethers.provider.getBalance(recipient.address);
    expect(finalRecipientBalance - initialRecipientBalance).to.equal(paymentAmount);
  });

  it("should revert if payment exceeds per-transaction limit", async function () {
    const excessiveAmount = ethers.parseEther("0.015"); // Exceeds 0.01 ETH limit
    await expect(
      agentWallet.connect(agent).executePayment(recipient.address, excessiveAmount)
    ).to.be.revertedWith("AgentWallet: per-transaction limit exceeded");
  });

  it("should revert if cumulative payments exceed daily spending limit", async function () {
    const paymentAmount = ethers.parseEther("0.01"); // Max per tx

    // Execute 5 payments of 0.01 = 0.05 ETH (Hits limit)
    for (let i = 0; i < 5; i++) {
      await agentWallet.connect(agent).executePayment(recipient.address, paymentAmount);
    }

    // 6th payment must fail
    await expect(
      agentWallet.connect(agent).executePayment(recipient.address, paymentAmount)
    ).to.be.revertedWith("AgentWallet: daily spending limit exceeded");
  });

  it("should prevent unauthorized callers from executing payment", async function () {
    const amount = ethers.parseEther("0.005");
    await expect(
      agentWallet.connect(unauthorized).executePayment(recipient.address, amount)
    ).to.be.revertedWith("AgentWallet: caller is not the authorized agent");
  });

  it("should block payments when paused and allow owner emergency withdrawal", async function () {
    await agentWallet.connect(owner).setPaused(true);
    expect(await agentWallet.paused()).to.be.true;

    // Agent payment fails while paused
    const amount = ethers.parseEther("0.005");
    await expect(
      agentWallet.connect(agent).executePayment(recipient.address, amount)
    ).to.be.revertedWith("AgentWallet: wallet is currently paused");

    // Owner can execute emergency withdrawal
    const withdrawAmount = ethers.parseEther("0.5");
    await expect(
      agentWallet.connect(owner).emergencyWithdraw(owner.address, withdrawAmount)
    ).to.emit(agentWallet, "EmergencyWithdrawal");
  });
});
