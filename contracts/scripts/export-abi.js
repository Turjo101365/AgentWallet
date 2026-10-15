/**
 * Copies the compiled AgentWallet ABI to shared/abi so the backend and frontend
 * use exactly the interface that was compiled and tested. Run after `hardhat compile`.
 */
const fs = require("fs");
const path = require("path");

const artifact = path.join(__dirname, "..", "artifacts", "src", "AgentWallet.sol", "AgentWallet.json");
const outDir = path.join(__dirname, "..", "..", "shared", "abi");
const { abi, contractName } = JSON.parse(fs.readFileSync(artifact, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "AgentWallet.json"), JSON.stringify({ contractName, abi }, null, 2) + "\n");
console.log(`Exported ${contractName} ABI (${abi.length} entries) to shared/abi/AgentWallet.json`);
