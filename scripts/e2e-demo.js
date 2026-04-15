/**
 * End-to-end smoke demo against a running Hardhat node.
 *
 * Expects the output of `deploy.js` to be pasted into the DEPLOYMENT object
 * below (or provided via env). Uses the default Hardhat-node accounts:
 *   account[0] = deployer/creator
 *   account[1] = investor
 */
const hre = require("hardhat");

const DEPLOYMENT = {
  marketplace: process.env.MARKETPLACE || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  usdc:        process.env.USDC        || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

function f(n, d = 6) { return hre.ethers.formatUnits(n, d); }

async function main() {
  const { ethers } = hre;
  const [creator, investor, outsider] = await ethers.getSigners();

  console.log("Marketplace:", DEPLOYMENT.marketplace);
  console.log("USDC:       ", DEPLOYMENT.usdc);
  console.log("Creator:    ", creator.address);
  console.log("Investor:   ", investor.address);
  console.log("Outsider:   ", outsider.address);
  console.log();

  const marketplace = await ethers.getContractAt("ProjectMarketplace", DEPLOYMENT.marketplace, creator);
  const usdc = await ethers.getContractAt("MockUSDC", DEPLOYMENT.usdc, creator);

  // --- fund the investor with some mUSDC ---
  await (await usdc.mint(investor.address, 10_000n * 10n ** 6n)).wait(); // 10,000 mUSDC
  console.log(`Investor USDC balance: ${f(await usdc.balanceOf(investor.address))}`);

  // --- 1. creator creates a project ---
  console.log("\n[1] createProject(SolarPark Brandenburg, SOLAR, 1000 tokens, 2.50 USDC/token)");
  const tx1 = await marketplace.createProject(
    "SolarPark Brandenburg",
    "SOLAR",
    "Finanzierung eines 5 MW Solarparks",
    1000n,               // 1000 whole tokens
    2_500_000n           // 2.50 USDC per token (6 decimals)
  );
  const rc1 = await tx1.wait();
  const projectId = 0n;
  const project = await marketplace.getProject(projectId);
  console.log("    token contract     :", project.token);
  console.log("    identity registry  :", project.identityRegistry);
  console.log("    compliance module  :", project.compliance);
  console.log("    total supply       :", f(project.tokensForSale, 18), "SOLAR");
  console.log("    price              :", f(project.pricePerToken, 6), "USDC/token");

  // --- 2. outsider tries to buy without KYC -> must revert ---
  console.log("\n[2] outsider tries to buy 10 SOLAR without being whitelisted (should REVERT)");
  const usdcAsOutsider = usdc.connect(outsider);
  const mpAsOutsider = marketplace.connect(outsider);
  await (await usdcAsOutsider.mint(outsider.address, 100_000_000n)).wait();
  await (await usdcAsOutsider.approve(DEPLOYMENT.marketplace, 25_000_000n)).wait();
  try {
    await mpAsOutsider.buyTokens(projectId, 10n);
    console.log("    UNEXPECTED: buy succeeded without KYC");
  } catch (err) {
    console.log("    OK, revert as expected:", err.shortMessage || err.reason || "reverted");
  }

  // --- 3. creator whitelists investor ---
  console.log("\n[3] creator whitelists investor (country=276 = Germany)");
  await (await marketplace.whitelistInvestor(projectId, investor.address, 276)).wait();
  console.log("    whitelisted =", await marketplace.isInvestorWhitelisted(projectId, investor.address));

  // --- 4. investor buys 10 tokens ---
  console.log("\n[4] investor approves USDC and buys 10 SOLAR (= 25 USDC)");
  const usdcAsInvestor = usdc.connect(investor);
  const mpAsInvestor = marketplace.connect(investor);
  await (await usdcAsInvestor.approve(DEPLOYMENT.marketplace, 25_000_000n)).wait();
  await (await mpAsInvestor.buyTokens(projectId, 10n)).wait();

  const token = await ethers.getContractAt("ProjectToken", project.token);
  console.log("    investor SOLAR balance :", f(await token.balanceOf(investor.address), 18));
  console.log("    investor USDC balance  :", f(await usdc.balanceOf(investor.address)));

  const p2 = await marketplace.getProject(projectId);
  console.log("    project tokensSold     :", f(p2.tokensSold, 18), "SOLAR");
  console.log("    project usdcRaised     :", f(p2.usdcRaised), "USDC");

  // --- 5. investor tries to send tokens to non-whitelisted outsider ---
  console.log("\n[5] investor tries to transfer 1 SOLAR to outsider (should REVERT by compliance)");
  const tokenAsInvestor = token.connect(investor);
  try {
    await tokenAsInvestor.transfer(outsider.address, 1n * 10n ** 18n);
    console.log("    UNEXPECTED: transfer succeeded");
  } catch (err) {
    console.log("    OK, revert as expected:", err.shortMessage || err.reason || "reverted");
  }

  // --- 6. creator withdraws USDC ---
  console.log("\n[6] creator withdraws raised USDC");
  const balBefore = await usdc.balanceOf(creator.address);
  await (await marketplace.withdraw(projectId)).wait();
  const balAfter = await usdc.balanceOf(creator.address);
  console.log("    creator received:", f(balAfter - balBefore), "USDC");

  console.log("\nAll good. Marketplace and ERC-3643 token are live at:");
  console.log("  Marketplace:", DEPLOYMENT.marketplace);
  console.log("  SOLAR token:", project.token);
  console.log("  USDC:       ", DEPLOYMENT.usdc);
}

main().catch((e) => { console.error(e); process.exit(1); });
