const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { signApproval, signGrant } = require("./helpers/approvals");

/**
 * v2: the contract itself verifies the owner's EIP-712 authorization (audit finding F2). These tests model a
 * COMPROMISED AGENT KEY: the attacker controls the agent and can submit any calldata, but holds no owner key.
 */
const ETH = ethers.ZeroAddress;
const e = (v) => ethers.parseEther(v);
const id = (label) => ethers.id(label);

async function deployFixture() {
  const [owner, agent, alice, bob, stranger, newOwner, controller] = await ethers.getSigners();
  const Wallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await Wallet.deploy(owner.address, agent.address, e("0.01"), e("0.05"));
  await owner.sendTransaction({ to: await wallet.getAddress(), value: e("1") });
  await wallet.setRecipient(alice.address, true);
  await wallet.setRecipient(bob.address, true);
  return { wallet, owner, agent, alice, bob, stranger, newOwner, controller, asAgent: wallet.connect(agent) };
}

describe("AgentWallet v2: on-chain owner authorization", function () {
  describe("compromised agent key without an owner signature", function () {
    it("cannot call the v1 unsigned executeTransfer entry point (removed in v2)", async function () {
      const { wallet, agent, alice } = await loadFixture(deployFixture);
      const v1 = new ethers.Interface(require("../../shared/abi/AgentWallet.v1.json").abi);
      const data = v1.encodeFunctionData("executeTransfer", [id("drain"), ETH, alice.address, e("0.01")]);
      const before = await ethers.provider.getBalance(alice.address);
      await expect(agent.sendTransaction({ to: await wallet.getAddress(), data })).to.be.reverted;
      expect(await ethers.provider.getBalance(alice.address)).to.equal(before);
      expect(wallet.interface.getFunction("executeTransfer")).to.equal(null);
    });

    it("rejects approvals signed by the agent, a stranger, or the zero signature", async function () {
      const { wallet, asAgent, agent, stranger, alice } = await loadFixture(deployFixture);
      for (const signer of [agent, stranger]) {
        const { approval, signature } = await signApproval(wallet, signer, { intentId: id(`forged-${signer.address}`), token: ETH, recipient: alice.address, amount: e("0.001") });
        await expect(asAgent.executeApprovedTransfer(approval, signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      }
      const { approval } = await signApproval(wallet, agent, { intentId: id("empty"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await expect(asAgent.executeApprovedTransfer(approval, "0x")).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
    });

    it("rejects any field substituted after the owner signed", async function () {
      const { wallet, asAgent, owner, alice, bob } = await loadFixture(deployFixture);
      const { approval, signature } = await signApproval(wallet, owner, { intentId: id("signed"), token: ETH, recipient: alice.address, amount: e("0.001") });
      for (const patch of [
        { amount: e("0.002") },
        { recipient: bob.address },
        { intentId: id("other") },
        { proposalId: "another-proposal" },
        { deadline: approval.deadline + 1000 },
        { token: "0x0000000000000000000000000000000000000001" },
      ]) {
        await expect(asAgent.executeApprovedTransfer({ ...approval, ...patch }, signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      }
      await expect(asAgent.executeApprovedTransfer(approval, signature)).to.emit(wallet, "TransferExecuted");
    });

    it("rejects a signature made for another chain or another wallet contract (cross-domain replay)", async function () {
      const { wallet, asAgent, owner, agent, alice } = await loadFixture(deployFixture);
      const fields = { intentId: id("x-domain"), token: ETH, recipient: alice.address, amount: e("0.001") };
      const otherChain = await signApproval(wallet, owner, fields, { chainId: 1 });
      await expect(asAgent.executeApprovedTransfer(otherChain.approval, otherChain.signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");

      const Wallet = await ethers.getContractFactory("AgentWallet");
      const twin = await Wallet.deploy(owner.address, agent.address, e("0.01"), e("0.05"));
      await owner.sendTransaction({ to: await twin.getAddress(), value: e("1") });
      await twin.setRecipient(alice.address, true);
      const forTwin = await signApproval(twin, owner, fields);
      await expect(asAgent.executeApprovedTransfer(forTwin.approval, forTwin.signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      await expect(twin.connect(agent).executeApprovedTransfer(forTwin.approval, forTwin.signature)).to.emit(twin, "TransferExecuted");
    });
  });

  describe("signed deadline, replay and revocation", function () {
    it("enforces the signed deadline on-chain (inclusive), never later", async function () {
      const { wallet, asAgent, owner, alice } = await loadFixture(deployFixture);
      const deadline = (await time.latest()) + 60;
      const late = await signApproval(wallet, owner, { intentId: id("late"), token: ETH, recipient: alice.address, amount: e("0.001"), deadline });
      const onTime = await signApproval(wallet, owner, { intentId: id("on-time"), token: ETH, recipient: alice.address, amount: e("0.001"), deadline });
      await time.setNextBlockTimestamp(deadline);
      await expect(asAgent.executeApprovedTransfer(onTime.approval, onTime.signature)).to.emit(wallet, "TransferExecuted");
      await expect(asAgent.executeApprovedTransfer(late.approval, late.signature))
        .to.be.revertedWithCustomError(wallet, "ApprovalExpired").withArgs(deadline);
      expect(await wallet.executedIntents(id("late"))).to.equal(false);
    });

    it("executes an approval at most once", async function () {
      const { wallet, asAgent, owner, alice } = await loadFixture(deployFixture);
      const { approval, signature } = await signApproval(wallet, owner, { intentId: id("once"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await asAgent.executeApprovedTransfer(approval, signature);
      await expect(asAgent.executeApprovedTransfer(approval, signature)).to.be.revertedWithCustomError(wallet, "IntentAlreadyExecuted");
    });

    it("lets only the owner cancel a signed, unexecuted intent", async function () {
      const { wallet, asAgent, owner, stranger, alice } = await loadFixture(deployFixture);
      const { approval, signature } = await signApproval(wallet, owner, { intentId: id("cancel-me"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await expect(wallet.connect(stranger).cancelIntent(id("cancel-me"))).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
      await expect(asAgent.cancelIntent(id("cancel-me"))).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
      await expect(wallet.cancelIntent(id("cancel-me"))).to.emit(wallet, "IntentCancelled").withArgs(id("cancel-me"));
      await expect(asAgent.executeApprovedTransfer(approval, signature)).to.be.revertedWithCustomError(wallet, "IntentIsCancelled");

      const done = await signApproval(wallet, owner, { intentId: id("done"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await asAgent.executeApprovedTransfer(done.approval, done.signature);
      await expect(wallet.cancelIntent(id("done"))).to.be.revertedWithCustomError(wallet, "IntentAlreadyExecuted");
    });

    it("voids the previous owner's approvals after an ownership change and accepts the new owner's", async function () {
      const { wallet, asAgent, owner, newOwner, alice } = await loadFixture(deployFixture);
      const old = await signApproval(wallet, owner, { intentId: id("old-owner"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await wallet.transferOwnership(newOwner.address);
      await wallet.connect(newOwner).acceptOwnership();
      await expect(asAgent.executeApprovedTransfer(old.approval, old.signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      const fresh = await signApproval(wallet, newOwner, { intentId: id("new-owner"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await expect(asAgent.executeApprovedTransfer(fresh.approval, fresh.signature)).to.emit(wallet, "TransferExecuted");
    });
  });

  describe("v1 limits still bind a validly signed approval", function () {
    it("caps, allowlist, pause, emergency stop and the agent-only rule all still apply", async function () {
      const { wallet, asAgent, owner, stranger, alice } = await loadFixture(deployFixture);
      const sign = (label, fields) => signApproval(wallet, owner, { intentId: id(label), token: ETH, recipient: alice.address, amount: e("0.001"), ...fields });

      let s = await sign("over-cap", { amount: e("0.02") });
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "PerTxLimitExceeded");
      s = await sign("not-allowlisted", { recipient: stranger.address });
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "RecipientNotAllowed");
      s = await sign("by-stranger");
      await expect(wallet.connect(stranger).executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "NotAgent");
      await expect(wallet.connect(owner).executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "NotAgent");
      for (let i = 0; i < 5; i++) {
        const ok = await sign(`fill-${i}`, { amount: e("0.01") });
        await asAgent.executeApprovedTransfer(ok.approval, ok.signature);
      }
      s = await sign("over-daily");
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "DailyLimitExceeded");

      await time.increase(86400);
      await wallet.pause();
      s = await sign("paused");
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "EnforcedPause");
      await wallet.unpause();
      await wallet.emergencyStop();
      await wallet.unpause();
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "NotAgent");
    });

    it("checkTransfer dry-runs the limits for the agent only and signs nothing", async function () {
      const { wallet, asAgent, stranger, alice } = await loadFixture(deployFixture);
      await asAgent.checkTransfer(id("dry"), ETH, alice.address, e("0.001"));
      await expect(asAgent.checkTransfer(id("dry"), ETH, alice.address, e("0.02"))).to.be.revertedWithCustomError(wallet, "PerTxLimitExceeded");
      await expect(asAgent.checkTransfer(id("dry"), ETH, stranger.address, 1n)).to.be.revertedWithCustomError(wallet, "RecipientNotAllowed");
      await expect(wallet.connect(stranger).checkTransfer(id("dry"), ETH, alice.address, 1n)).to.be.revertedWithCustomError(wallet, "NotAgent");
    });
  });

  describe("bounded task grants", function () {
    it("runs a grant up to maxRuns, tracks runs and spend on-chain, then refuses", async function () {
      const { wallet, asAgent, owner, alice } = await loadFixture(deployFixture);
      const { grant, signature } = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.002"), maxRuns: 2 });
      const digest = await wallet.grantDigest(grant);
      await expect(asAgent.executeGrantTransfer(grant, signature, id("run-1"))).to.emit(wallet, "GrantRunExecuted").withArgs(digest, id("run-1"), 1, e("0.002"));
      await expect(asAgent.executeGrantTransfer(grant, signature, id("run-2"))).to.emit(wallet, "TransferExecuted");
      expect(await wallet.grantRuns(digest)).to.equal(2n);
      expect(await wallet.grantSpent(digest)).to.equal(e("0.004"));
      await expect(asAgent.executeGrantTransfer(grant, signature, id("run-3"))).to.be.revertedWithCustomError(wallet, "GrantExhausted").withArgs(digest);
    });

    it("enforces maxTotal when maxRuns is unused", async function () {
      const { wallet, asAgent, owner, alice } = await loadFixture(deployFixture);
      const { grant, signature } = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.003"), maxRuns: 0, maxTotal: e("0.007") });
      await asAgent.executeGrantTransfer(grant, signature, id("t-1"));
      await asAgent.executeGrantTransfer(grant, signature, id("t-2"));
      await expect(asAgent.executeGrantTransfer(grant, signature, id("t-3"))).to.be.revertedWithCustomError(wallet, "GrantExhausted");
    });

    it("refuses unbounded, expired, revoked, tampered and replayed grant runs", async function () {
      const { wallet, asAgent, owner, stranger, alice, bob } = await loadFixture(deployFixture);
      const unbounded = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.001"), maxRuns: 0, maxTotal: 0 });
      await expect(asAgent.executeGrantTransfer(unbounded.grant, unbounded.signature, id("u"))).to.be.revertedWithCustomError(wallet, "UnboundedGrant");

      const validUntil = (await time.latest()) + 30;
      const short = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.001"), maxRuns: 5, validUntil });
      await time.increase(31);
      await expect(asAgent.executeGrantTransfer(short.grant, short.signature, id("late"))).to.be.revertedWithCustomError(wallet, "GrantExpired").withArgs(validUntil);

      const g = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.001"), maxRuns: 5 });
      for (const patch of [{ recipient: bob.address }, { amountPerRun: e("0.002") }, { maxRuns: 50 }, { validUntil: g.grant.validUntil + 1 }, { scheduleHash: id("other") }, { taskId: "other" }]) {
        await expect(asAgent.executeGrantTransfer({ ...g.grant, ...patch }, g.signature, id("tampered"))).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      }
      const byStranger = await signGrant(wallet, stranger, { token: ETH, recipient: alice.address, amountPerRun: e("0.001"), maxRuns: 5 });
      await expect(asAgent.executeGrantTransfer(byStranger.grant, byStranger.signature, id("s"))).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");

      await asAgent.executeGrantTransfer(g.grant, g.signature, id("g-1"));
      await expect(asAgent.executeGrantTransfer(g.grant, g.signature, id("g-1"))).to.be.revertedWithCustomError(wallet, "IntentAlreadyExecuted");

      const digest = await wallet.grantDigest(g.grant);
      await expect(wallet.connect(stranger).revokeGrant(digest)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
      await expect(asAgent.revokeGrant(digest)).to.be.revertedWithCustomError(wallet, "OwnableUnauthorizedAccount");
      await expect(wallet.revokeGrant(digest)).to.emit(wallet, "GrantRevoked").withArgs(digest);
      await expect(asAgent.executeGrantTransfer(g.grant, g.signature, id("g-2"))).to.be.revertedWithCustomError(wallet, "GrantIsRevoked").withArgs(digest);
    });

    it("voids grants signed by a previous owner", async function () {
      const { wallet, asAgent, owner, newOwner, alice } = await loadFixture(deployFixture);
      const g = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.001"), maxRuns: 3 });
      await asAgent.executeGrantTransfer(g.grant, g.signature, id("before"));
      await wallet.transferOwnership(newOwner.address);
      await wallet.connect(newOwner).acceptOwnership();
      await expect(asAgent.executeGrantTransfer(g.grant, g.signature, id("after"))).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
    });

    it("a compromised agent can at most use what the grant still allows, within the caps", async function () {
      const { wallet, asAgent, owner, alice } = await loadFixture(deployFixture);
      const g = await signGrant(wallet, owner, { token: ETH, recipient: alice.address, amountPerRun: e("0.01"), maxRuns: 10 });
      for (let i = 0; i < 5; i++) await asAgent.executeGrantTransfer(g.grant, g.signature, id(`burst-${i}`));
      await expect(asAgent.executeGrantTransfer(g.grant, g.signature, id("burst-5"))).to.be.revertedWithCustomError(wallet, "DailyLimitExceeded");
      expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(e("0.05"));
    });
  });

  describe("signature compatibility", function () {
    it("computes exactly the digests the backend asks owners to sign", async function () {
      const { wallet, owner, alice } = await loadFixture(deployFixture);
      const { approvalTypedData, intentIdFor } = await import("../../backend/src/lib/approval.js");
      const { grantTypedData } = await import("../../backend/src/lib/schedule.js");
      const { chainId } = await ethers.provider.getNetwork();
      const contractAddress = await wallet.getAddress();
      const proposalId = "2556bd41-3031-4b39-893e-a9b6389b0b95";
      const proposal = {
        id: proposalId, chainId: Number(chainId), contractAddress, token: { address: ETH }, recipient: alice.address,
        amountWei: e("0.001").toString(), expiresAt: (await time.latest()) + 600,
        intentId: intentIdFor({ chainId: Number(chainId), contractAddress, proposalId }),
      };
      const td = approvalTypedData(proposal);
      expect(await wallet.approvalDigest(td.message)).to.equal(ethers.TypedDataEncoder.hash(td.domain, td.types, td.message));

      const task = {
        id: "6f0b1c2a-1111-4222-8333-944455556666", chainId: Number(chainId), contractAddress, token: { address: ETH }, recipient: alice.address,
        amountWei: e("0.002").toString(), maxRuns: 4, maxTotalWei: null, validUntil: (await time.latest()) + 86400,
        schedule: { type: "weekly", weekday: 1, hour: 9, minute: 0 }, condition: null, executionWindowSeconds: 0,
      };
      const gd = grantTypedData(task);
      expect(await wallet.grantDigest(gd.message)).to.equal(ethers.TypedDataEncoder.hash(gd.domain, gd.types, gd.message));

      // And a signature produced from the backend's typed data executes.
      const sig = await owner.signTypedData(td.domain, td.types, td.message);
      const [, agent] = await ethers.getSigners();
      await expect(wallet.connect(agent).executeApprovedTransfer(td.message, sig)).to.emit(wallet, "TransferExecuted").withArgs(proposal.intentId, ETH, alice.address, e("0.001"), await wallet.currentDay(), e("0.001"));
    });

    it("accepts an ERC-1271 smart-contract owner and rejects it when the owner contract says no", async function () {
      const { wallet, asAgent, owner, controller, alice } = await loadFixture(deployFixture);
      const Mock = await ethers.getContractFactory("MockERC1271Owner");
      const safe = await Mock.deploy(controller.address);
      await wallet.transferOwnership(await safe.getAddress());
      await safe.connect(controller).forward(await wallet.getAddress(), wallet.interface.encodeFunctionData("acceptOwnership"));
      expect(await wallet.owner()).to.equal(await safe.getAddress());

      const s = await signApproval(wallet, controller, { intentId: id("1271"), token: ETH, recipient: alice.address, amount: e("0.001") });
      const byOldEoa = await signApproval(wallet, owner, { intentId: id("1271-old"), token: ETH, recipient: alice.address, amount: e("0.001") });
      await expect(asAgent.executeApprovedTransfer(byOldEoa.approval, byOldEoa.signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      await safe.connect(controller).setRejectAll(true);
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.be.revertedWithCustomError(wallet, "InvalidOwnerSignature");
      await safe.connect(controller).setRejectAll(false);
      await expect(asAgent.executeApprovedTransfer(s.approval, s.signature)).to.emit(wallet, "TransferExecuted");
    });
  });
});

describe("AgentWallet v2: pre-signature simulation", function () {
  it("simulateTransfer exercises the real send but always reverts and can never move funds", async function () {
    const { wallet, asAgent, stranger, alice } = await loadFixture(deployFixture);
    await expect(asAgent.simulateTransfer.staticCall(id("sim"), ETH, alice.address, e("0.001"))).to.be.revertedWithCustomError(wallet, "SimulationSucceeded");

    const Rec = await ethers.getContractFactory("RevertingRecipient");
    const rec = await Rec.deploy();
    await wallet.setRecipient(await rec.getAddress(), true);
    await expect(asAgent.simulateTransfer.staticCall(id("sim-bad"), ETH, await rec.getAddress(), e("0.001"))).to.be.revertedWithCustomError(wallet, "NativeTransferFailed");
    // checkTransfer (limits only) cannot see this; the full simulation can.
    await asAgent.checkTransfer(id("sim-bad"), ETH, await rec.getAddress(), e("0.001"));

    // Even sent as a real transaction by a compromised agent key, it reverts: no funds, no intent, no cap used.
    const before = await ethers.provider.getBalance(alice.address);
    await expect(asAgent.simulateTransfer(id("sim-sent"), ETH, alice.address, e("0.01"), { gasLimit: 300000 })).to.be.revertedWithCustomError(wallet, "SimulationSucceeded");
    expect(await ethers.provider.getBalance(alice.address)).to.equal(before);
    expect(await wallet.executedIntents(id("sim-sent"))).to.equal(false);
    expect(await wallet.spentPerDay(ETH, await wallet.currentDay())).to.equal(0n);
    await expect(wallet.connect(stranger).simulateTransfer.staticCall(id("x"), ETH, alice.address, 1n)).to.be.revertedWithCustomError(wallet, "NotAgent");
  });
});
