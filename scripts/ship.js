#!/usr/bin/env node
/**
 * One-shot "ship it" helper: deploy the contracts to the selected network,
 * have deploy.js patch frontend/config.js, then commit + push so that a
 * Vercel project that's connected to this repo picks up the new addresses
 * automatically.
 *
 * Usage:
 *   node scripts/ship.js amoy      # Polygon Amoy testnet
 *   node scripts/ship.js polygon   # Polygon mainnet
 *   node scripts/ship.js localhost # requires a running `npx hardhat node`
 *
 * Requires a non-empty PRIVATE_KEY in .env for amoy/polygon.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd, opts = {}) {
  console.log(`\n\u2192 ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: path.resolve(__dirname, ".."), ...opts });
}

function main() {
  const network = process.argv[2];
  if (!network || !["amoy", "polygon", "localhost"].includes(network)) {
    console.error("Usage: node scripts/ship.js <amoy|polygon|localhost>");
    process.exit(1);
  }

  if (network !== "localhost") {
    const envPath = path.resolve(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) {
      console.error("\u2717 .env not found. Copy .env.example to .env and fill PRIVATE_KEY.");
      process.exit(1);
    }
    const env = fs.readFileSync(envPath, "utf8");
    if (!/^\s*PRIVATE_KEY\s*=\s*\S+/m.test(env)) {
      console.error("\u2717 PRIVATE_KEY is empty in .env.");
      process.exit(1);
    }
  }

  // 1. compile & test before touching a real chain
  run("npx hardhat compile");
  run("npx hardhat test");

  // 2. deploy (deploy.js patches frontend/config.js)
  run(`npx hardhat run scripts/deploy.js --network ${network}`);

  // 3. commit + push so Vercel auto-deploys
  const status = execSync("git status --porcelain frontend/config.js", {
    cwd: path.resolve(__dirname, ".."),
  }).toString();
  if (!status.trim()) {
    console.log("\nfrontend/config.js unchanged, nothing to commit.");
    return;
  }

  run("git add frontend/config.js");
  run(`git commit -m "chore: point frontend at new ${network} deployment"`);

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    run(`git push -u origin ${branch}`);
  } catch (err) {
    console.error("\n\u26a0  git push failed. Push manually when ready.");
    process.exit(1);
  }

  console.log("\n\u2713 Done. If your Vercel project is connected to this repo,");
  console.log("  a new deployment should start within a few seconds.");
}

main();
