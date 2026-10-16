require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

// Public-network deployment needs an explicitly supplied key. There is no default key.
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
// Source verification only (read access to explorer APIs, never a signing key). One Etherscan V2 key
// covers Base Sepolia (84532) and Ethereum Sepolia (11155111); without it, `npx hardhat verify` uses Sourcify, which needs no key.
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

if (DEPLOYER_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(DEPLOYER_PRIVATE_KEY)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    // In-process network used by `hardhat test`.
    hardhat: { chainId: 31337 },
    // `npx hardhat node` started separately (see npm run chain).
    localhost: { url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545", chainId: 31337 },
    base_sepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: { enabled: ETHERSCAN_API_KEY !== "", apiKey: ETHERSCAN_API_KEY },
  sourcify: { enabled: true },
  mocha: { timeout: 60000 },
};
