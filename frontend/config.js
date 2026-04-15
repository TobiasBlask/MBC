// Runtime config for the frontend. Edit these after deploying.
// Runtime config for the frontend. Edit these after deploying.
//
// For a fresh `npx hardhat node` followed by `npm run deploy:local` the
// addresses are deterministic and will be exactly:
//   Marketplace: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
//   MockUSDC:    0x5FbDB2315678afecb367f032d93F642f64180aa3
// so you can paste those without having to re-run anything.
window.MBC_CONFIG = {
  MARKETPLACE_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Polygon mainnet native USDC:  0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  // Amoy:                         paste your deployed MockUSDC address here
  // Local hardhat node:           see comment above
  USDC_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Expected chain id. 137 = Polygon mainnet, 80002 = Amoy, 31337 = hardhat.
  EXPECTED_CHAIN_ID: 80002,
  EXPECTED_CHAIN_NAME: "Polygon Amoy",
};
