const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [creator, investor] = await ethers.getSigners();
  const marketplace = await ethers.getContractAt(
    "ProjectMarketplace",
    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    creator
  );
  const usdc = await ethers.getContractAt(
    "MockUSDC",
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    creator
  );
  // Create one existing project so the list isn't empty.
  await (await marketplace.createProject(
    "SolarPark Brandenburg",
    "SOLAR",
    "Finanzierung eines 5 MW Solarparks in Brandenburg. Laufzeit 10 Jahre.",
    1000n,
    2_500_000n  // 2.50 USDC
  )).wait();
  // Mint some USDC to the investor wallet for the upcoming demo
  await (await usdc.mint(investor.address, 100_000_000n)).wait(); // 100 USDC
  console.log("seeded: 1 project + investor USDC balance");
  console.log("investor:", investor.address);
}
main().catch(e => { console.error(e); process.exit(1); });
