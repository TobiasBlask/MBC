// Hand-written ABI fragments. We only include the functions/events the
// frontend actually calls, so the file stays small and reviewable.
window.MBC_ABIS = {
  marketplace: [
    // views
    "function projectCount() view returns (uint256)",
    "function getProject(uint256 projectId) view returns (tuple(address creator, address token, address identityRegistry, address compliance, string name, string description, uint256 pricePerToken, uint256 tokensForSale, uint256 tokensSold, uint256 usdcRaised, uint256 usdcWithdrawn))",
    "function isInvestorWhitelisted(uint256 projectId, address investor) view returns (bool)",
    "function usdc() view returns (address)",

    // writes
    "function createProject(string name, string symbol, string description, uint256 totalSupply, uint256 pricePerToken) returns (uint256)",
    "function whitelistInvestor(uint256 projectId, address investor, uint16 country)",
    "function removeInvestor(uint256 projectId, address investor)",
    "function buyTokens(uint256 projectId, uint256 tokenAmount)",
    "function withdraw(uint256 projectId)",

    // events
    "event ProjectCreated(uint256 indexed projectId, address indexed creator, address indexed token, address identityRegistry, address compliance, string name, uint256 totalSupply, uint256 pricePerToken)",
    "event TokensPurchased(uint256 indexed projectId, address indexed buyer, uint256 tokenAmount, uint256 usdcAmount)",
    "event InvestorWhitelisted(uint256 indexed projectId, address indexed investor, address indexed by, uint16 country)",
    "event FundsWithdrawn(uint256 indexed projectId, address indexed creator, uint256 amount)",
  ],

  erc20: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
    "function approve(address, uint256) returns (bool)",
    "function transfer(address, uint256) returns (bool)",
  ],

  projectToken: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function version() view returns (string)",
    "function paused() view returns (bool)",
    "function identityRegistry() view returns (address)",
    "function compliance() view returns (address)",
  ],

  // MockUSDC only - for the "Mint test USDC" button shown on non-mainnet
  mockUsdc: [
    "function mint(address to, uint256 amount)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ],
};
