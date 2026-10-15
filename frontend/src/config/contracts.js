export const AGENT_WALLET_ABI = [
  "function owner() view returns (address)",
  "function authorizedAgent() view returns (address)",
  "function perTransactionLimit() view returns (uint256)",
  "function dailySpendingLimit() view returns (uint256)",
  "function paused() view returns (bool)",
  "function dailySpent(uint256 day) view returns (uint256)",
  "function walletBalance() view returns (uint256)",
  "function deposit() payable",
  "function executePayment(address recipient, uint256 amount)",
  "function setAuthorizedAgent(address newAgent)",
  "function setSpendingLimits(uint256 newPerTransactionLimit, uint256 newDailyLimit)",
  "function setPaused(bool status)",
  "function emergencyWithdraw(address recipient, uint256 amount)",
  "event Deposited(address indexed from, uint256 amount)",
  "event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, uint256 indexed day)",
  "event AgentUpdated(address indexed newAgent)",
  "event LimitsUpdated(uint256 perTransaction, uint256 daily)",
  "event PauseUpdated(bool isPaused)",
  "event EmergencyWithdrawal(address indexed to, uint256 amount)"
];

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';
