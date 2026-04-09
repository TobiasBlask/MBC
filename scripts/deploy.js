/**
 * Deploy script for the MBC Polygon marketplace.
 *
 * On hardhat / localhost it deploys a MockUSDC and uses that address.
 * On Amoy / Polygon it expects USDC_ADDRESS to be set in .env; if it is not
 * set on Amoy we deploy MockUSDC as a fallback (so you can get started without
 * hunting for a faucet).
 */
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} native`);

  // ---- USDC ----
  let usdcAddress = process.env.USDC_ADDRESS || "";
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const isAmoy = network.name === "amoy";

  if (!usdcAddress && (isLocal || isAmoy)) {
    console.log("No USDC_ADDRESS set, deploying MockUSDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mock = await MockUSDC.deploy();
    await mock.waitForDeployment();
    usdcAddress = await mock.getAddress();
    console.log(`MockUSDC:        ${usdcAddress}`);

    // Mint some test balance to the deployer so they can play immediately
    const tenThousand = 10_000n * 10n ** 6n; // 10_000 mUSDC
    const tx = await mock.mint(deployer.address, tenThousand);
    await tx.wait();
    console.log(`Minted 10,000 mUSDC to deployer`);
  }

  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS is required for this network. Set it in .env.");
  }

  // ---- Marketplace ----
  const Marketplace = await ethers.getContractFactory("ProjectMarketplace");
  const marketplace = await Marketplace.deploy(usdcAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  console.log("");
  console.log("=== Deployment complete ===");
  console.log(`USDC:         ${usdcAddress}`);
  console.log(`Marketplace:  ${marketplaceAddress}`);
  console.log("");
  console.log("Paste these into frontend/config.js:");
  console.log(`  MARKETPLACE_ADDRESS = "${marketplaceAddress}"`);
  console.log(`  USDC_ADDRESS        = "${usdcAddress}"`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
