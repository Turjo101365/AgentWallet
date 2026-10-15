/**
 * Deploys AgentWallet and writes deployments/<network>.json for the backend.
 *
 * Local (hardhat / localhost, chain 31337):
 *   Uses the deterministic Hardhat accounts: #0 owner, #1 agent, #2/#3 demo payees.
 *   Also deploys a test-only MockERC20 ("mUSDC", 6 decimals), funds the wallet and
 *   configures ETH + mUSDC limits so the full pipeline can be exercised immediately.
 *
 * Base Sepolia (chain 84532):
 *   Refuses to run unless CONFIRM_PUBLIC_DEPLOY=yes and OWNER_ADDRESS / AGENT_ADDRESS are set.
 *   Deploys only AgentWallet; no mock tokens, no funding, no recipients.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const { ethers, network } = hre;
const LOCAL_CHAIN_ID = 31337n;
const PUBLIC_CHAIN_IDS = { 84532n: "base_sepolia" };

function requireAddress(name) {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) throw new Error(`${name} must be set to a valid address`);
  return ethers.getAddress(value);
}

function writeDeployment(record) {
  const dir = process.env.DEPLOYMENTS_DIR || path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.network}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}

async function waitFor(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`Transaction ${tx.hash} reverted`);
  return receipt;
}

async function deployLocal(chainId) {
  const [owner, agent, payeeA, payeeB] = await ethers.getSigners();
  const nativePerTx = ethers.parseEther(process.env.NATIVE_PER_TX_ETH || "0.01");
  const nativeDaily = ethers.parseEther(process.env.NATIVE_DAILY_ETH || "0.05");

  const Wallet = await ethers.getContractFactory("AgentWallet", owner);
  const wallet = await Wallet.deploy(owner.address, agent.address, nativePerTx, nativeDaily);
  const deployReceipt = await wallet.deploymentTransaction().wait();
  const walletAddress = await wallet.getAddress();

  const Token = await ethers.getContractFactory("MockERC20", owner);
  const token = await Token.deploy("Mock USD Coin (test only)", "mUSDC", 6);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  await waitFor(owner.sendTransaction({ to: walletAddress, value: ethers.parseEther("5") }));
  await waitFor(token.mint(walletAddress, ethers.parseUnits("10000", 6)));
  await waitFor(wallet.setTokenPolicy(tokenAddress, true, ethers.parseUnits("100", 6), ethers.parseUnits("250", 6)));
  await waitFor(wallet.setRecipient(payeeA.address, true));
  await waitFor(wallet.setRecipient(payeeB.address, true));

  // Synthetic local price feeds (Chainlink AggregatorV3 interface, 8 decimals).
  const Feed = await ethers.getContractFactory("MockPriceFeed", owner);
  const ethFeed = await Feed.deploy(8, "ETH / USD (local synthetic)", 3000n * 10n ** 8n);
  await ethFeed.waitForDeployment();
  const usdFeed = await Feed.deploy(8, "mUSDC / USD (local synthetic)", 1n * 10n ** 8n);
  await usdFeed.waitForDeployment();

  return {
    network: "localhost",
    chainId: Number(chainId),
    contractAddress: walletAddress,
    deployBlock: deployReceipt.blockNumber,
    owner: owner.address,
    agent: agent.address,
    tokens: [
      { symbol: "ETH", address: ethers.ZeroAddress, decimals: 18, native: true },
      { symbol: "mUSDC", address: tokenAddress, decimals: 6, native: false, testOnly: true },
    ],
    demoRecipients: [
      { label: "Acme Components (supplier, Hardhat #2)", category: "supplier", address: payeeA.address },
      { label: "Contractor payroll (Hardhat #3)", category: "payroll", address: payeeB.address },
    ],
    priceFeeds: [
      { token: ethers.ZeroAddress, feed: await ethFeed.getAddress(), source: "local-mock-feed (synthetic price, not market data)" },
      { token: tokenAddress, feed: await usdFeed.getAddress(), source: "local-mock-feed (synthetic price, not market data)" },
    ],
    deployedAt: new Date().toISOString(),
  };
}

async function deployPublic(chainId, name) {
  if (process.env.CONFIRM_PUBLIC_DEPLOY !== "yes") {
    throw new Error(`Refusing to deploy to ${name}: set CONFIRM_PUBLIC_DEPLOY=yes after explicit approval.`);
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account: set DEPLOYER_PRIVATE_KEY in contracts/.env");
  const owner = requireAddress("OWNER_ADDRESS");
  const agent = requireAddress("AGENT_ADDRESS");
  if (owner === agent) throw new Error("OWNER_ADDRESS and AGENT_ADDRESS must differ");
  const nativePerTx = ethers.parseEther(process.env.NATIVE_PER_TX_ETH || "0.001");
  const nativeDaily = ethers.parseEther(process.env.NATIVE_DAILY_ETH || "0.005");

  const Wallet = await ethers.getContractFactory("AgentWallet", deployer);
  const wallet = await Wallet.deploy(owner, agent, nativePerTx, nativeDaily);
  const receipt = await wallet.deploymentTransaction().wait();

  return {
    network: name,
    chainId: Number(chainId),
    contractAddress: await wallet.getAddress(),
    deployBlock: receipt.blockNumber,
    deployTxHash: receipt.hash,
    owner,
    agent,
    tokens: [{ symbol: "ETH", address: ethers.ZeroAddress, decimals: 18, native: true }],
    demoRecipients: [],
    // Add verified Chainlink feeds here, e.g. { token, feed, source: "chainlink:<feed address>" }.
    priceFeeds: [],
    deployedAt: new Date().toISOString(),
  };
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  let record;
  if (chainId === LOCAL_CHAIN_ID) {
    record = await deployLocal(chainId);
    if (network.name === "hardhat") record.network = "hardhat-inprocess";
  } else if (PUBLIC_CHAIN_IDS[chainId]) {
    record = await deployPublic(chainId, PUBLIC_CHAIN_IDS[chainId]);
  } else {
    throw new Error(`Unsupported chain id ${chainId}. Only 31337 (local) and 84532 (Base Sepolia) are allowed.`);
  }

  const file = writeDeployment(record);
  console.log(`AgentWallet deployed at ${record.contractAddress} on chain ${record.chainId}`);
  console.log(`Owner ${record.owner}, agent ${record.agent}`);
  console.log(`Deployment record: ${file}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
