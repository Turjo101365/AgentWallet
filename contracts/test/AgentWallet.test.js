const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const ETH = ethers.ZeroAddress;
const e = (v) => ethers.parseEther(v);
const usdc = (v) => ethers.parseUnits(v, 6);
const intent = (label) => ethers.id(label);

async function deployFixture() {
  const [owner, agent, alice, bob, stranger, newOwner] = await ethers.getSigners();

  const Wallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await Wallet.deploy(owner.address, agent.address, e("0.01"), e("0.05"));
  await wallet.waitForDeployment();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Mock USD Coin", "mUSDC", 6);
  await token.waitForDeployment();

  await owner.sendTransaction({ to: await wallet.getAddress(), value: e("1") });
  await token.mint(await wallet.getAddress(), usdc("10000"));
  await wallet.setRecipient(alice.address, true);
  await wallet.setTokenPolicy(await token.getAddress(), true, usdc("100"), usdc("250"));

  return { wallet, token, owner, agent, alice, bob, stranger, newOwner };
}

describe("AgentWallet", function () {
  describe("deployment and roles", function () {
    it("sets owner, agent and the native ETH policy from constructor args", async function () {
      const { wallet, owner, agent } = await loadFixture(deployFixture);
      expect(await wallet.owner()).to.equal(owner.address);
      expect(await wallet.agent()).to.equal(agent.address);
      const policy = await wallet.tokenPolicy(ETH);
      expect(policy.enabled).to.equal(true);
      expect(policy.perTxLimit).to.equal(e("0.01"));
      expect(policy.dailyLimit).to.equal(e("0.05"));
    });

    it("rejects an agent equal to the owner at construction", async function () {
      const [owner] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory("AgentWallet");
      await expect(Wallet.deploy(owner.address, owner.address, e("0.01"), e("0.05")))
        .to.be.revertedWithCustomError(Wallet, "AgentCannotBeOwner");
    });

    it("allows deploying with no agent and ETH disabled", async function () {
      const [owner] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory("AgentWallet");
      const w = await Wallet.deploy(owner.address, ethers.ZeroAddress, 0, 0);
      expect(await w.agent()).to.equal(ethers.ZeroAddress);
      expect((await w.tokenPolicy(ETH)).enabled).to.equal(false);
    });

    it("only the owner can manage agent, recipients, policies, pause and withdrawals", async function () {
      const { wallet, stranger, agent, alice } = await loadFixture(deployFixture);
      for (const signer of [stranger, agent]) {
        const w = wallet.connect(signer);
        await expect(w.setAgent(stranger.address)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.revokeAgent()).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.setRecipient(stranger.address, true)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.setTokenPolicy(ETH, true, 1, 1)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.pause()).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.emergencyStop()).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
        await expect(w.withdraw(ETH, alice.address, 1)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
      }
    });

    it("cannot set the agent to the owner, the pending owner or zero", async function () {
      const { wallet, owner, newOwner } = await loadFixture(deployFixture);
      await expect(wallet.setAgent(owner.address)).to.be.revertedWithCustomError(wallet, "AgentCannotBeOwner");
      await expect(wallet.setAgent(ethers.ZeroAddress)).to.be.revertedWithCustomError(wallet, "InvalidAddress");
      await wallet.transferOwnership(newOwner.address);
      await expect(wallet.setAgent(newOwner.address)).to.be.revertedWithCustomError(wallet, "AgentCannotBeOwner");
    });

    it("rotates and revokes the agent with events", async function () {
      const { wallet, agent, bob, alice } = await loadFixture(deployFixture);
      await expect(wallet.setAgent(bob.address)).to.emit(wallet, "AgentUpdated").withArgs(agent.address, bob.address);
      await expect(wallet.connect(agent).executeTransfer(intent("a"), ETH, alice.address, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "NotAgent");
      await expect(wallet.revokeAgent()).to.emit(wallet, "AgentUpdated").withArgs(bob.address, ethers.ZeroAddress);
      await expect(wallet.connect(bob).executeTransfer(intent("b"), ETH, alice.address, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "NotAgent");
    });

    it("uses two-step ownership and the agent can never accept ownership", async function () {
      const { wallet, owner, agent, newOwner } = await loadFixture(deployFixture);
      await wallet.transferOwnership(agent.address);
      await expect(wallet.connect(agent).acceptOwnership()).to.be.revertedWithCustomError(wallet, "AgentCannotBeOwner");
      await wallet.transferOwnership(newOwner.address);
      expect(await wallet.owner()).to.equal(owner.address);
      await wallet.connect(newOwner).acceptOwnership();
      expect(await wallet.owner()).to.equal(newOwner.address);
    });

    it("disables renounceOwnership", async function () {
      const { wallet } = await loadFixture(deployFixture);
      await expect(wallet.renounceOwnership()).to.be.revertedWithCustomError(wallet, "RenounceDisabled");
    });
  });

  describe("native ETH transfers", function () {
    it("transfers to an allowlisted recipient and emits TransferExecuted", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const id = intent("pay-alice-1");
      const day = await wallet.currentDay();
      const tx = wallet.connect(agent).executeTransfer(id, ETH, alice.address, e("0.005"));
      await expect(tx).to.changeEtherBalances([wallet, alice], [-e("0.005"), e("0.005")]);
      await expect(tx).to.emit(wallet, "TransferExecuted").withArgs(id, ETH, alice.address, e("0.005"), day, e("0.005"));
      expect(await wallet.executedIntents(id)).to.equal(true);
      expect(await wallet.spentPerDay(ETH, day)).to.equal(e("0.005"));
      expect(await wallet.remainingDailyAllowance(ETH)).to.equal(e("0.045"));
    });

    it("rejects non-allowlisted, removed, zero or self recipients", async function () {
      const { wallet, agent, alice, bob } = await loadFixture(deployFixture);
      const a = wallet.connect(agent);
      await expect(a.executeTransfer(intent("1"), ETH, bob.address, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "RecipientNotAllowed").withArgs(bob.address);
      await wallet.setRecipient(alice.address, false);
      await expect(a.executeTransfer(intent("2"), ETH, alice.address, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "RecipientNotAllowed");
      await expect(a.executeTransfer(intent("3"), ETH, ethers.ZeroAddress, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "RecipientNotAllowed");
      await expect(wallet.setRecipient(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(wallet, "InvalidAddress");
      await expect(wallet.setRecipient(await wallet.getAddress(), true)).to.be.revertedWithCustomError(wallet, "InvalidAddress");
    });

    it("enforces the per-transaction cap at the exact boundary", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const a = wallet.connect(agent);
      await expect(a.executeTransfer(intent("ok"), ETH, alice.address, e("0.01"))).to.not.be.reverted;
      await expect(a.executeTransfer(intent("over"), ETH, alice.address, e("0.01") + 1n))
        .to.be.revertedWithCustomError(wallet, "PerTxLimitExceeded").withArgs(e("0.01") + 1n, e("0.01"));
    });

    it("enforces the daily cap and resets it on the next UTC day", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const a = wallet.connect(agent);
      for (let i = 0; i < 5; i++) await a.executeTransfer(intent(`d${i}`), ETH, alice.address, e("0.01"));
      await expect(a.executeTransfer(intent("d5"), ETH, alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "DailyLimitExceeded").withArgs(1n, 0n);
      const day = await wallet.currentDay();
      await time.increaseTo((day + 1n) * 86400n + 1n);
      await expect(a.executeTransfer(intent("d6"), ETH, alice.address, e("0.01"))).to.not.be.reverted;
    });

    it("reports zero remaining when the owner lowers the cap below today's spend", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      await wallet.connect(agent).executeTransfer(intent("x"), ETH, alice.address, e("0.01"));
      await wallet.setTokenPolicy(ETH, true, e("0.005"), e("0.005"));
      expect(await wallet.remainingDailyAllowance(ETH)).to.equal(0n);
      await expect(wallet.connect(agent).executeTransfer(intent("y"), ETH, alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "DailyLimitExceeded").withArgs(1n, 0n);
    });

    it("rejects zero amount, zero intent and replayed intents", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const a = wallet.connect(agent);
      await expect(a.executeTransfer(intent("z"), ETH, alice.address, 0)).to.be.revertedWithCustomError(wallet, "InvalidAmount");
      await expect(a.executeTransfer(ethers.ZeroHash, ETH, alice.address, 1)).to.be.revertedWithCustomError(wallet, "ZeroIntent");
      const id = intent("once");
      await a.executeTransfer(id, ETH, alice.address, e("0.001"));
      await expect(a.executeTransfer(id, ETH, alice.address, e("0.001")))
        .to.be.revertedWithCustomError(wallet, "IntentAlreadyExecuted").withArgs(id);
    });

    it("rejects transfers above the available balance", async function () {
      const { wallet, owner, agent, alice } = await loadFixture(deployFixture);
      await wallet.withdraw(ETH, owner.address, e("0.995"));
      await expect(wallet.connect(agent).executeTransfer(intent("big"), ETH, alice.address, e("0.01")))
        .to.be.revertedWithCustomError(wallet, "InsufficientBalance").withArgs(e("0.01"), e("0.005"));
    });

    it("rejects a disabled asset", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      await wallet.setTokenPolicy(ETH, false, 0, 0);
      await expect(wallet.connect(agent).executeTransfer(intent("off"), ETH, alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "TokenNotEnabled").withArgs(ETH);
    });

    it("reverts with NativeTransferFailed when the recipient rejects ETH, leaving state untouched", async function () {
      const { wallet, agent } = await loadFixture(deployFixture);
      const Rec = await ethers.getContractFactory("RevertingRecipient");
      const rec = await Rec.deploy();
      await wallet.setRecipient(await rec.getAddress(), true);
      const id = intent("rejected");
      await expect(wallet.connect(agent).executeTransfer(id, ETH, await rec.getAddress(), e("0.001")))
        .to.be.revertedWithCustomError(wallet, "NativeTransferFailed");
      expect(await wallet.executedIntents(id)).to.equal(false);
      expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(0n);
    });
  });

  describe("ERC-20 transfers", function () {
    it("transfers an enabled token within its own limits", async function () {
      const { wallet, token, agent, alice } = await loadFixture(deployFixture);
      const t = await token.getAddress();
      const tx = wallet.connect(agent).executeTransfer(intent("t1"), t, alice.address, usdc("100"));
      await expect(tx).to.changeTokenBalances(token, [wallet, alice], [-usdc("100"), usdc("100")]);
      await expect(tx).to.emit(wallet, "TransferExecuted");
      expect(await wallet.spentPerDay(t, await wallet.currentDay())).to.equal(usdc("100"));
      expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(0n);
    });

    it("tracks token limits independently of ETH limits", async function () {
      const { wallet, token, agent, alice } = await loadFixture(deployFixture);
      const t = await token.getAddress();
      const a = wallet.connect(agent);
      await expect(a.executeTransfer(intent("t-over"), t, alice.address, usdc("100") + 1n))
        .to.be.revertedWithCustomError(wallet, "PerTxLimitExceeded");
      await a.executeTransfer(intent("t2"), t, alice.address, usdc("100"));
      await a.executeTransfer(intent("t3"), t, alice.address, usdc("100"));
      await expect(a.executeTransfer(intent("t4"), t, alice.address, usdc("51")))
        .to.be.revertedWithCustomError(wallet, "DailyLimitExceeded").withArgs(usdc("51"), usdc("50"));
      await expect(a.executeTransfer(intent("eth-still-ok"), ETH, alice.address, e("0.01"))).to.not.be.reverted;
    });

    it("rejects tokens that were never enabled", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const Token = await ethers.getContractFactory("MockERC20");
      const other = await Token.deploy("Other", "OTH", 18);
      await other.mint(await wallet.getAddress(), e("10"));
      await expect(wallet.connect(agent).executeTransfer(intent("o"), await other.getAddress(), alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "TokenNotEnabled");
    });

    it("refuses policies for non-contract tokens, the wallet itself, or invalid limits", async function () {
      const { wallet, stranger } = await loadFixture(deployFixture);
      await expect(wallet.setTokenPolicy(stranger.address, true, 1, 1)).to.be.revertedWithCustomError(wallet, "InvalidToken");
      await expect(wallet.setTokenPolicy(await wallet.getAddress(), true, 1, 1)).to.be.revertedWithCustomError(wallet, "InvalidToken");
      await expect(wallet.setTokenPolicy(ETH, true, 0, 1)).to.be.revertedWithCustomError(wallet, "InvalidLimits");
      await expect(wallet.setTokenPolicy(ETH, true, 2, 1)).to.be.revertedWithCustomError(wallet, "InvalidLimits");
    });

    it("reverts when a token returns false (SafeERC20) and keeps the intent unused", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const Bad = await ethers.getContractFactory("FalseReturnToken");
      const bad = await Bad.deploy();
      await bad.mint(await wallet.getAddress(), 1000n);
      await wallet.setTokenPolicy(await bad.getAddress(), true, 100n, 100n);
      const id = intent("false-token");
      await expect(wallet.connect(agent).executeTransfer(id, await bad.getAddress(), alice.address, 10n))
        .to.be.revertedWithCustomError(wallet, "SafeERC20FailedOperation");
      expect(await wallet.executedIntents(id)).to.equal(false);
    });

    it("supports tokens whose transfer returns no value", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const NoRet = await ethers.getContractFactory("NoReturnToken");
      const t = await NoRet.deploy();
      await t.mint(await wallet.getAddress(), 1000n);
      await wallet.setTokenPolicy(await t.getAddress(), true, 100n, 100n);
      await wallet.connect(agent).executeTransfer(intent("noret"), await t.getAddress(), alice.address, 10n);
      expect(await t.balanceOf(alice.address)).to.equal(10n);
    });
  });

  describe("pause, emergency and withdrawals", function () {
    it("pause blocks agent transfers but not deposits or owner withdrawals", async function () {
      const { wallet, owner, agent, alice } = await loadFixture(deployFixture);
      await wallet.pause();
      await expect(wallet.connect(agent).executeTransfer(intent("p"), ETH, alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "EnforcedPause");
      await expect(wallet.deposit({ value: e("0.1") })).to.emit(wallet, "Deposited");
      await expect(wallet.withdraw(ETH, owner.address, e("0.1"))).to.emit(wallet, "Withdrawn");
      await wallet.unpause();
      await expect(wallet.connect(agent).executeTransfer(intent("p2"), ETH, alice.address, 1n)).to.not.be.reverted;
    });

    it("emergencyStop pauses and revokes the agent atomically", async function () {
      const { wallet, agent } = await loadFixture(deployFixture);
      await expect(wallet.emergencyStop()).to.emit(wallet, "EmergencyStop").withArgs(agent.address);
      expect(await wallet.paused()).to.equal(true);
      expect(await wallet.agent()).to.equal(ethers.ZeroAddress);
      await expect(wallet.emergencyStop()).to.not.be.reverted; // idempotent while paused
    });

    it("emergencyWithdraw requires the paused state and validates inputs", async function () {
      const { wallet, token, owner } = await loadFixture(deployFixture);
      await expect(wallet.emergencyWithdraw(ETH, owner.address, 1n)).to.be.revertedWithCustomError(wallet, "ExpectedPause");
      await wallet.pause();
      await expect(wallet.emergencyWithdraw(ETH, ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(wallet, "InvalidAddress");
      await expect(wallet.emergencyWithdraw(ETH, owner.address, 0n)).to.be.revertedWithCustomError(wallet, "InvalidAmount");
      await expect(wallet.emergencyWithdraw(ETH, owner.address, e("2"))).to.be.revertedWithCustomError(wallet, "InsufficientBalance");
      const tx = wallet.emergencyWithdraw(await token.getAddress(), owner.address, usdc("10000"));
      await expect(tx).to.changeTokenBalance(token, owner, usdc("10000"));
      await expect(tx).to.emit(wallet, "EmergencyWithdrawal");
    });

    it("rejects zero deposits", async function () {
      const { wallet } = await loadFixture(deployFixture);
      await expect(wallet.deposit({ value: 0 })).to.be.revertedWithCustomError(wallet, "InvalidAmount");
    });
  });

  describe("adversarial", function () {
    it("blocks re-entrancy from a malicious agent+recipient contract", async function () {
      const { wallet, owner } = await loadFixture(deployFixture);
      const Attacker = await ethers.getContractFactory("ReentrantAgent");
      const attacker = await Attacker.deploy(await wallet.getAddress());
      const addr = await attacker.getAddress();
      await wallet.setAgent(addr);
      await wallet.setRecipient(addr, true);
      const before = await ethers.provider.getBalance(await wallet.getAddress());

      await attacker.connect(owner).run(intent("outer"), e("0.01"));

      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect(await ethers.provider.getBalance(await wallet.getAddress())).to.equal(before - e("0.01"));
      expect(await wallet.executedIntents(ethers.id("reentry"))).to.equal(false);
      expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(e("0.01"));
    });

    it("keeps spend within the daily cap under a randomized sequence of attempts", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const a = wallet.connect(agent);
      let expected = 0n;
      let seed = 12345;
      for (let i = 0; i < 40; i++) {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        const amount = BigInt(seed % 12_000_000) * 1_000_000_000n; // 0 .. 0.012 ETH
        const tx = a.executeTransfer(intent(`r${i}`), ETH, alice.address, amount);
        const ok = amount > 0n && amount <= e("0.01") && expected + amount <= e("0.05");
        if (ok) {
          await tx;
          expected += amount;
        } else {
          await expect(tx).to.be.reverted;
        }
        expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(expected);
      }
      expect(expected <= e("0.05")).to.equal(true);
    });

    it("the owner key cannot move funds through the agent path", async function () {
      const { wallet, owner, alice } = await loadFixture(deployFixture);
      await expect(wallet.connect(owner).executeTransfer(intent("own"), ETH, alice.address, 1n))
        .to.be.revertedWithCustomError(wallet, "NotAgent");
    });
  });
});
