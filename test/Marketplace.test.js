const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProjectMarketplace (ERC-3643)", function () {
  async function deployFixture() {
    const [deployer, creator, investor, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Marketplace = await ethers.getContractFactory("ProjectMarketplace");
    const marketplace = await Marketplace.deploy(await usdc.getAddress());
    await marketplace.waitForDeployment();

    // Fund investor with USDC
    await (await usdc.mint(investor.address, 1_000_000_000n)).wait(); // 1000 USDC

    return { deployer, creator, investor, outsider, usdc, marketplace };
  }

  it("creates a project with its own token + identity + compliance", async function () {
    const { creator, marketplace } = await deployFixture();

    // 1 whole token costs 1.50 USDC -> 1_500_000 base units
    const price = 1_500_000n;
    const supply = 1000n; // whole tokens

    const tx = await marketplace.connect(creator).createProject(
      "Alpha Project",
      "ALPHA",
      "A toy project",
      supply,
      price
    );
    const receipt = await tx.wait();

    const created = receipt.logs
      .map((l) => {
        try { return marketplace.interface.parseLog(l); } catch { return null; }
      })
      .find((e) => e && e.name === "ProjectCreated");
    expect(created).to.not.equal(undefined);
    expect(created.args.creator).to.equal(creator.address);

    const project = await marketplace.getProject(0);
    expect(project.creator).to.equal(creator.address);
    expect(project.tokensForSale).to.equal(supply * 10n ** 18n);
    expect(project.pricePerToken).to.equal(price);

    const token = await ethers.getContractAt("ProjectToken", project.token);
    expect(await token.name()).to.equal("Alpha Project");
    expect(await token.symbol()).to.equal("ALPHA");
    expect(await token.totalSupply()).to.equal(supply * 10n ** 18n);
    // marketplace should hold the full initial supply
    expect(await token.balanceOf(await marketplace.getAddress())).to.equal(supply * 10n ** 18n);
  });

  it("blocks buys from non-whitelisted addresses", async function () {
    const { creator, investor, usdc, marketplace } = await deployFixture();
    await marketplace.connect(creator).createProject("A", "A", "desc", 100n, 1_000_000n);

    const marketplaceAddr = await marketplace.getAddress();
    await (await usdc.connect(investor).approve(marketplaceAddr, 1_000_000_000n)).wait();

    await expect(marketplace.connect(investor).buyTokens(0, 5n)).to.be.reverted;
  });

  it("lets a whitelisted investor buy tokens at the fixed price", async function () {
    const { creator, investor, usdc, marketplace } = await deployFixture();
    const price = 2_000_000n; // 2 USDC per token
    await marketplace.connect(creator).createProject("B", "B", "desc", 500n, price);

    // Creator whitelists the investor
    await (await marketplace.connect(creator).whitelistInvestor(0, investor.address, 276)).wait();
    expect(await marketplace.isInvestorWhitelisted(0, investor.address)).to.equal(true);

    // Investor approves + buys 10 whole tokens = 20 USDC
    const marketplaceAddr = await marketplace.getAddress();
    await (await usdc.connect(investor).approve(marketplaceAddr, 20_000_000n)).wait();
    await (await marketplace.connect(investor).buyTokens(0, 10n)).wait();

    const project = await marketplace.getProject(0);
    expect(project.tokensSold).to.equal(10n * 10n ** 18n);
    expect(project.usdcRaised).to.equal(20_000_000n);

    const token = await ethers.getContractAt("ProjectToken", project.token);
    expect(await token.balanceOf(investor.address)).to.equal(10n * 10n ** 18n);
  });

  it("lets the creator withdraw raised USDC", async function () {
    const { creator, investor, usdc, marketplace } = await deployFixture();
    await marketplace.connect(creator).createProject("C", "C", "desc", 100n, 1_000_000n);
    await (await marketplace.connect(creator).whitelistInvestor(0, investor.address, 0)).wait();

    const marketplaceAddr = await marketplace.getAddress();
    await (await usdc.connect(investor).approve(marketplaceAddr, 5_000_000n)).wait();
    await (await marketplace.connect(investor).buyTokens(0, 5n)).wait();

    const balBefore = await usdc.balanceOf(creator.address);
    await (await marketplace.connect(creator).withdraw(0)).wait();
    const balAfter = await usdc.balanceOf(creator.address);
    expect(balAfter - balBefore).to.equal(5_000_000n);
  });

  it("blocks peer-to-peer transfers to non-whitelisted addresses", async function () {
    const { creator, investor, outsider, usdc, marketplace } = await deployFixture();
    await marketplace.connect(creator).createProject("D", "D", "desc", 100n, 1_000_000n);
    await (await marketplace.connect(creator).whitelistInvestor(0, investor.address, 0)).wait();

    const marketplaceAddr = await marketplace.getAddress();
    await (await usdc.connect(investor).approve(marketplaceAddr, 3_000_000n)).wait();
    await (await marketplace.connect(investor).buyTokens(0, 3n)).wait();

    const project = await marketplace.getProject(0);
    const token = await ethers.getContractAt("ProjectToken", project.token);

    // Outsider is NOT in the identity registry -> transfer must revert
    await expect(
      token.connect(investor).transfer(outsider.address, 1n * 10n ** 18n)
    ).to.be.reverted;
  });
});
