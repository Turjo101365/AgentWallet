const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("----------------------------------------------------");
  console.log("Deploying AgentWallet Smart Contract...");
  console.log(`Network: ${hre.network.name} (Chain ID: ${hre.network.config.chainId || 'unknown'})`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer Account: ${deployer ? deployer.address : "No signer configured"}`);

  const AgentWallet = await hre.ethers.getContractFactory("AgentWallet");
  const agentWallet = await AgentWallet.deploy();
  await agentWallet.waitForDeployment();

  const contractAddress = await agentWallet.getAddress();
  console.log(`AgentWallet successfully deployed to: ${contractAddress}`);

  // Save deployment metadata
  const deploymentDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  const deploymentData = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress: contractAddress,
    deployer: deployer ? deployer.address : null,
    deployedAt: new Date().toISOString(),
    constructorArgs: []
  };

  const outputPath = path.join(deploymentDir, `${hre.network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log(`Deployment metadata written to: ${outputPath}`);
  console.log("----------------------------------------------------");
  console.log("To connect this contract with AgentWallet backend & frontend:");
  console.log(`Update AGENT_WALLET_CONTRACT_ADDRESS in .env with ${contractAddress}`);
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
