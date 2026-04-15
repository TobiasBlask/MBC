// Runtime config for the frontend. Edit these after deploying.
//
// For a fresh `npx hardhat node` followed by `npm run deploy:local` the
// addresses are deterministic and will be exactly the ones hardcoded below,
// so you can just `npm run frontend` after deploying.
window.MBC_CONFIG = {
  MARKETPLACE_ADDRESS: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  USDC_ADDRESS:        "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  EXPECTED_CHAIN_ID:   31337,
  EXPECTED_CHAIN_NAME: "Hardhat Local",
};
