/**
 * Playwright-driven product demo recording.
 *
 * Opens http://127.0.0.1:8080/ in headless Chromium, injects a minimal
 * window.ethereum shim that passes every RPC call straight to the running
 * Hardhat node (all accounts unlocked), and walks a scripted user flow while
 * recording video. Outputs a WebM and, if ffmpeg is available, an MP4.
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *     node scripts/record-demo.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const OUT_DIR = path.resolve(__dirname, "..", "media");
const URL = "http://127.0.0.1:8080/";
const RPC = "http://127.0.0.1:8545";

// First Hardhat default account = our "creator" in the demo
const DEMO_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();

// The shim code is injected into the page BEFORE any script runs, so the
// frontend's `window.ethereum` check picks it up instead of bailing out.
const ETHEREUM_SHIM = /* js */ `
  (() => {
    const RPC = ${JSON.stringify(RPC)};
    const ACCOUNT = ${JSON.stringify(DEMO_ACCOUNT)};
    let id = 0;
    async function rpc(method, params) {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params || [] }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    }
    window.ethereum = {
      isMetaMask: true,
      chainId: "0x7a69",
      selectedAddress: ACCOUNT,
      async request({ method, params }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") {
          return [ACCOUNT];
        }
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
          return null;
        }
        // Route every other method to the local Hardhat node. All accounts
        // are unlocked there, so eth_sendTransaction works without signing.
        return rpc(method, params);
      },
      on() {},
      removeListener() {},
    };
  })();
`;

// Helper: small human-paced typing and waits so the video is watchable.
async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function caption(page, text, ms = 2500) {
  await page.evaluate((t) => {
    let el = document.getElementById("__caption__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__caption__";
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "32px",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "10px",
        font: "500 16px/1.3 -apple-system, system-ui, sans-serif",
        zIndex: 99999,
        maxWidth: "80%",
        textAlign: "center",
        boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
        transition: "opacity .25s",
      });
      document.body.appendChild(el);
    }
    el.style.opacity = "1";
    el.textContent = t;
  }, text);
  await pause(page, ms);
}

async function hideCaption(page) {
  await page.evaluate(() => {
    const el = document.getElementById("__caption__");
    if (el) el.style.opacity = "0";
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
    deviceScaleFactor: 1,
  });
  await context.addInitScript({ content: ETHEREUM_SHIM });

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[page err]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[page error]", err.message));

  // --- 1. Landing page ---
  await page.goto(URL, { waitUntil: "networkidle" });
  await caption(page, "MBC Marketplace — ERC-3643 Projekt-Tokenisierung auf Polygon", 3500);

  // --- 2. Read-only load already shows the seeded project ---
  await caption(page, "Read-only: Seed-Projekt wird direkt aus der Chain geladen", 3500);
  await pause(page, 800);

  // --- 3. Wallet connect ---
  await caption(page, "Wallet verbinden...", 1800);
  await page.click("#connectBtn");
  await page.waitForSelector(".badge.badge-ok", { timeout: 10000 });
  await caption(page, "Verbunden mit Hardhat (Chain 31337)", 2500);

  // --- 4. Scroll to create form ---
  await caption(page, "Neues Projekt tokenisieren", 2200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await pause(page, 600);

  await page.fill('input[name="name"]', "WindPark NRW");
  await page.fill('input[name="symbol"]', "WIND");
  await page.fill('textarea[name="description"]', "Finanzierung eines 8 MW Windparks in Nordrhein-Westfalen.");
  await page.fill('input[name="totalSupply"]', "500");
  await page.fill('input[name="priceUsdc"]', "3.00");
  await caption(page, "Formular ausgefüllt: 500 WIND @ 3.00 USDC", 2500);

  // --- 5. Submit create (deploys ERC-3643 token + registry + compliance) ---
  await caption(page, "Submit → deployt Token + IdentityRegistry + Compliance", 2800);
  await Promise.all([
    page.click('#createForm button[type="submit"]'),
    page.waitForFunction(
      () => {
        const items = document.querySelectorAll("#projectList .project");
        return items.length >= 2;
      },
      null,
      { timeout: 60000 }
    ),
  ]);
  await caption(page, "Projekt live — neuer Token automatisch in der Liste", 3000);

  // --- 6. Scroll to the new project ---
  await page.evaluate(() => {
    const items = document.querySelectorAll("#projectList .project");
    const last = items[items.length - 1];
    last.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await pause(page, 1500);

  // --- 7. Creator whitelists themselves so they can also buy ---
  await caption(page, "KYC: Creator whitelistet die eigene Adresse als Investor", 3000);
  await page.evaluate((acct) => {
    const items = document.querySelectorAll("#projectList .project");
    const last = items[items.length - 1];
    last.querySelector(".wl-addr").value = acct;
    last.querySelector(".wl-country").value = "276";
  }, DEMO_ACCOUNT);
  await page.evaluate(() => {
    const items = document.querySelectorAll("#projectList .project");
    const last = items[items.length - 1];
    last.querySelector(".wl-btn").click();
  });
  await page.waitForSelector("#noticeBox.notice.ok", { timeout: 30000 });
  await caption(page, "Whitelist-Transaktion bestätigt", 2200);

  // --- 8. Check KYC on the seeded "SolarPark" project for the same account ---
  await caption(page, "Für das Seed-Projekt SOLAR: Creator-Adresse whitelisten", 2800);
  await page.evaluate((acct) => {
    const first = document.querySelectorAll("#projectList .project")[0];
    first.scrollIntoView({ behavior: "smooth", block: "center" });
    first.querySelector(".wl-addr").value = acct;
    first.querySelector(".wl-country").value = "276";
    first.querySelector(".wl-btn").click();
  }, DEMO_ACCOUNT);
  await page.waitForSelector("#noticeBox.notice.ok", { timeout: 30000 });
  await pause(page, 1500);

  // --- 9. Buy 10 SOLAR tokens ---
  await caption(page, "10 SOLAR kaufen — USDC approve + buyTokens", 3000);
  await page.evaluate(() => {
    const first = document.querySelectorAll("#projectList .project")[0];
    first.querySelector(".buy-amount").value = "10";
    first.querySelector(".buy-btn").click();
  });
  // Wait until the "Erfolgreich ... gekauft" notice appears
  await page.waitForFunction(
    () => {
      const n = document.getElementById("noticeBox");
      return n && !n.classList.contains("hidden") && n.textContent.includes("gekauft");
    },
    null,
    { timeout: 60000 }
  );
  await caption(page, "Kauf erfolgreich — 10 SOLAR für 25 USDC", 3500);

  // --- 10. Final shot: project list with updated numbers ---
  await page.evaluate(() => document.getElementById("refreshBtn").click());
  await pause(page, 1500);
  await hideCaption(page);
  await caption(page, "Ende — Marketplace + ERC-3643 + KYC-Whitelist, self-hosted auf Polygon", 4500);

  await page.close();
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  const finalWebm = path.join(OUT_DIR, "demo.webm");
  fs.renameSync(videoPath, finalWebm);
  console.log("Saved:", finalWebm);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
