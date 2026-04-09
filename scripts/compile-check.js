/**
 * Standalone compile check using the locally installed solc-js.
 * Used only in constrained environments where Hardhat cannot download the
 * solidity compiler. It compiles every .sol file under contracts/ and reports
 * errors; it does NOT write artifacts.
 */
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".sol")) out.push(full);
  }
  return out;
}

const sources = {};
for (const file of walk(CONTRACTS_DIR)) {
  const rel = path.relative(ROOT, file);
  sources[rel] = { content: fs.readFileSync(file, "utf8") };
}

function findImport(importPath) {
  // resolve relative to contracts/ root (Hardhat style)
  const candidates = [
    path.resolve(ROOT, importPath),
    path.resolve(CONTRACTS_DIR, importPath),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return { contents: fs.readFileSync(cand, "utf8") };
    }
  }
  return { error: "File not found: " + importPath };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") hasError = true;
    console.log(err.formattedMessage || err.message);
  }
}

if (hasError) {
  console.log("\n\u2717 Compile failed");
  process.exit(1);
}

console.log("\u2713 Compile OK");
const names = [];
for (const file of Object.keys(output.contracts || {})) {
  for (const contract of Object.keys(output.contracts[file])) {
    names.push(`${file}:${contract}`);
  }
}
console.log("Compiled contracts:");
for (const n of names) console.log("  - " + n);
