// Runtime config for the frontend. Edit these after deploying.
window.MBC_CONFIG = {
  // Address of the deployed ProjectMarketplace contract.
  MARKETPLACE_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Address of the USDC token the marketplace accepts.
  // Polygon mainnet native USDC:  0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  // Amoy:                         paste your deployed MockUSDC address here
  // Local hardhat node:           paste the MockUSDC address printed by `npm run deploy:local`
  USDC_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Expected chain id. 137 = Polygon mainnet, 80002 = Amoy, 31337 = hardhat.
  EXPECTED_CHAIN_ID: 80002,

  // Human label for the expected chain, shown in the UI.
  EXPECTED_CHAIN_NAME: "Polygon Amoy",
};
