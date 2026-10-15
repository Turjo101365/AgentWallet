require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

const BASE_SEPOLIA_RPC_URL = process.env.RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 84532,
    },
    base_sepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY !== "0x0000000000000000000000000000000000000000000000000000000000000001" ? [PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
};
