/* eslint-disable no-undef */
// MBC Marketplace frontend. Talks to the ProjectMarketplace contract via
// ethers.js v6 and MetaMask (window.ethereum). No build step, no bundler.

const cfg = window.MBC_CONFIG;
const abis = window.MBC_ABIS;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let provider = null;
let signer = null;
let account = null;
let marketplace = null;      // ethers Contract, signer-bound once connected
let marketplaceRead = null;  // read-only fallback (provider-bound)
let usdcContract = null;
let usdcDecimals = 6;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showNotice(msg, kind = "info") {
  const box = $("#noticeBox");
  box.className = "notice " + (kind === "error" ? "error" : kind === "ok" ? "ok" : "");
  box.textContent = msg;
  box.classList.remove("hidden");
  if (kind === "ok") setTimeout(() => box.classList.add("hidden"), 4000);
}

function hideNotice() {
  $("#noticeBox").classList.add("hidden");
}

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatUsdc(amount) {
  return ethers.formatUnits(amount, usdcDecimals);
}

function parseUsdc(str) {
  return ethers.parseUnits(String(str), usdcDecimals);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  $("#mpAddr").textContent = cfg.MARKETPLACE_ADDRESS;
  $("#usdcAddr").textContent = cfg.USDC_ADDRESS;
  $("#expectedChain").textContent = `${cfg.EXPECTED_CHAIN_NAME} (${cfg.EXPECTED_CHAIN_ID})`;

  $("#connectBtn").addEventListener("click", connectWallet);
  $("#refreshBtn").addEventListener("click", () => loadProjects());
  $("#createForm").addEventListener("submit", onCreateProject);
  $("#mintMockBtn").addEventListener("click", onMintMock);

  // Read-only load attempt using the default RPC so the project list works
  // even before the user connects their wallet.
  try {
    const defaultRpc = pickDefaultRpc();
    if (defaultRpc) {
      const roProvider = new ethers.JsonRpcProvider(defaultRpc);
      marketplaceRead = new ethers.Contract(cfg.MARKETPLACE_ADDRESS, abis.marketplace, roProvider);
      loadProjects().catch(() => {});
    }
  } catch (e) {
    console.warn("read-only provider init failed", e);
  }

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
}

function pickDefaultRpc() {
  switch (cfg.EXPECTED_CHAIN_ID) {
    case 137:   return "https://polygon-rpc.com";
    case 80002: return "https://rpc-amoy.polygon.technology";
    case 31337: return "http://127.0.0.1:8545";
    default:    return null;
  }
}

// ---------------------------------------------------------------------------
// Wallet connection
// ---------------------------------------------------------------------------
async function connectWallet() {
  hideNotice();
  if (!window.ethereum) {
    showNotice("Keine Wallet gefunden. Bitte MetaMask installieren.", "error");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    account = accounts[0];
    signer = await provider.getSigner();

    const net = await provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== cfg.EXPECTED_CHAIN_ID) {
      $("#networkBadge").className = "badge badge-err";
      $("#networkBadge").textContent = `falsches Netzwerk (${chainId})`;
      await tryAddOrSwitchChain();
      return;
    }

    $("#networkBadge").className = "badge badge-ok";
    $("#networkBadge").textContent = cfg.EXPECTED_CHAIN_NAME;
    $("#accountLabel").textContent = shortAddr(account);
    $("#connectBtn").textContent = "Verbunden";
    $("#connectBtn").disabled = true;

    marketplace = new ethers.Contract(cfg.MARKETPLACE_ADDRESS, abis.marketplace, signer);
    marketplaceRead = marketplace;
    usdcContract = new ethers.Contract(cfg.USDC_ADDRESS, abis.erc20, signer);

    try {
      usdcDecimals = Number(await usdcContract.decimals());
    } catch (_) {
      usdcDecimals = 6;
    }

    await loadProjects();
    await refreshMockUsdcCard();
  } catch (err) {
    console.error(err);
    showNotice(err.shortMessage || err.message || "Verbindung fehlgeschlagen", "error");
  }
}

async function tryAddOrSwitchChain() {
  const hexId = "0x" + cfg.EXPECTED_CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
    window.location.reload();
  } catch (err) {
    if (err.code === 4902 && cfg.EXPECTED_CHAIN_ID === 80002) {
      // Add Amoy
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x13882",
              chainName: "Polygon Amoy",
              nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
              rpcUrls: ["https://rpc-amoy.polygon.technology"],
              blockExplorerUrls: ["https://amoy.polygonscan.com"],
            },
          ],
        });
        window.location.reload();
      } catch (e2) {
        showNotice("Konnte Netzwerk nicht hinzufügen: " + (e2.message || e2), "error");
      }
    } else {
      showNotice("Bitte manuell auf " + cfg.EXPECTED_CHAIN_NAME + " wechseln.", "error");
    }
  }
}

// ---------------------------------------------------------------------------
// Project creation
// ---------------------------------------------------------------------------
async function onCreateProject(e) {
  e.preventDefault();
  if (!marketplace) {
    showNotice("Bitte zuerst Wallet verbinden.", "error");
    return;
  }
  const form = e.target;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const symbol = String(data.get("symbol") || "").trim();
  const description = String(data.get("description") || "").trim();
  const totalSupply = BigInt(String(data.get("totalSupply")).trim());
  const priceUsdc = String(data.get("priceUsdc")).trim();

  if (!name || !symbol || totalSupply <= 0n) {
    showNotice("Bitte alle Pflichtfelder ausfüllen.", "error");
    return;
  }

  let priceBase;
  try {
    priceBase = parseUsdc(priceUsdc);
  } catch (_) {
    showNotice("Preis ungültig.", "error");
    return;
  }

  try {
    showNotice("Projekt wird erstellt... (deployt Token + Identity + Compliance)");
    const tx = await marketplace.createProject(name, symbol, description, totalSupply, priceBase);
    await tx.wait();
    showNotice("Projekt erfolgreich erstellt!", "ok");
    form.reset();
    await loadProjects();
  } catch (err) {
    console.error(err);
    showNotice(err.shortMessage || err.reason || err.message || "Erstellung fehlgeschlagen", "error");
  }
}

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------
async function loadProjects() {
  const c = marketplace || marketplaceRead;
  if (!c) return;

  let count;
  try {
    count = Number(await c.projectCount());
  } catch (err) {
    console.error(err);
    $("#projectList").innerHTML = `<p class="muted">Projekte konnten nicht geladen werden (${err.shortMessage || err.message}).</p>`;
    return;
  }

  if (count === 0) {
    $("#projectList").innerHTML = `<p class="muted">Noch keine Projekte. Erstelle oben das erste.</p>`;
    return;
  }

  const list = [];
  for (let i = 0; i < count; i++) {
    try {
      const p = await c.getProject(i);
      list.push({ id: i, ...p });
    } catch (err) {
      console.warn("project load failed", i, err);
    }
  }

  $("#projectList").innerHTML = "";
  for (const p of list) {
    $("#projectList").appendChild(renderProject(p));
  }
}

function renderProject(p) {
  const el = document.createElement("div");
  el.className = "project";

  const tokensForSale = p.tokensForSale; // bigint
  const tokensSold = p.tokensSold;
  const wholeForSale = tokensForSale / 10n ** 18n;
  const wholeSold = tokensSold / 10n ** 18n;
  const pct = tokensForSale === 0n ? 0 : Number((tokensSold * 10000n) / tokensForSale) / 100;

  const isCreator = account && p.creator.toLowerCase() === account.toLowerCase();
  const pricePerWhole = formatUsdc(p.pricePerToken);

  el.innerHTML = `
    <div class="head">
      <div>
        <h3>${escapeHtml(p.name)} <span class="ticker">#${p.id}</span></h3>
        <div class="addr-mono">Token: ${p.token}</div>
      </div>
      <div class="ticker">${escapeHtml(shortAddr(p.creator))}${isCreator ? " (du)" : ""}</div>
    </div>
    ${p.description ? `<p class="desc">${escapeHtml(p.description)}</p>` : ""}
    <div class="meta">
      <div><strong>${pricePerWhole} USDC</strong>pro Token</div>
      <div><strong>${wholeForSale.toString()}</strong>Gesamt</div>
      <div><strong>${wholeSold.toString()}</strong>verkauft</div>
      <div><strong>${formatUsdc(p.usdcRaised)}</strong>USDC eingenommen</div>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="project-actions">
      <input type="number" min="1" step="1" placeholder="Anzahl Tokens" class="buy-amount" />
      <button class="buy-btn">Kaufen</button>
      <button class="check-kyc-btn ghost">KYC-Status prüfen</button>
    </div>
    ${
      isCreator
        ? `
      <div class="kyc-box">
        <div class="kyc-title">KYC / Whitelist (nur Ersteller)</div>
        <div class="project-actions">
          <input type="text" placeholder="0x... Investor-Adresse" class="wl-addr" />
          <input type="number" min="0" max="999" step="1" placeholder="Country (ISO num)" class="wl-country" value="0" />
          <button class="wl-btn">Whitelisten</button>
          <button class="wl-remove-btn ghost">Entfernen</button>
          <button class="withdraw-btn ghost">USDC abheben (${formatUsdc(p.usdcRaised - p.usdcWithdrawn)})</button>
        </div>
      </div>
    `
        : ""
    }
  `;

  el.querySelector(".buy-btn").addEventListener("click", () =>
    onBuy(p, el.querySelector(".buy-amount").value)
  );
  el.querySelector(".check-kyc-btn").addEventListener("click", () => onCheckKyc(p));

  if (isCreator) {
    el.querySelector(".wl-btn").addEventListener("click", () =>
      onWhitelist(p, el.querySelector(".wl-addr").value, el.querySelector(".wl-country").value)
    );
    el.querySelector(".wl-remove-btn").addEventListener("click", () =>
      onRemoveWhitelist(p, el.querySelector(".wl-addr").value)
    );
    el.querySelector(".withdraw-btn").addEventListener("click", () => onWithdraw(p));
  }

  return el;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function onBuy(project, amountStr) {
  if (!marketplace) { showNotice("Bitte Wallet verbinden.", "error"); return; }
  const amount = Number(amountStr);
  if (!amount || amount <= 0) { showNotice("Bitte Anzahl eingeben.", "error"); return; }

  const tokenAmount = BigInt(amount);
  const cost = tokenAmount * project.pricePerToken;

  try {
    // Check whitelist first for a clearer error than a revert from the token
    const ok = await marketplace.isInvestorWhitelisted(project.id, account);
    if (!ok) {
      showNotice(
        "Du bist für dieses Projekt noch nicht whitelisted. Der Projekt-Ersteller muss deine Adresse zuerst KYC-verifizieren.",
        "error"
      );
      return;
    }

    const allowance = await usdcContract.allowance(account, cfg.MARKETPLACE_ADDRESS);
    if (allowance < cost) {
      showNotice("USDC Approval wird gesendet...");
      const aTx = await usdcContract.approve(cfg.MARKETPLACE_ADDRESS, cost);
      await aTx.wait();
    }

    showNotice("Kauf wird ausgeführt...");
    const tx = await marketplace.buyTokens(project.id, tokenAmount);
    await tx.wait();
    showNotice(`Erfolgreich ${amount} Tokens gekauft.`, "ok");
    await loadProjects();
  } catch (err) {
    console.error(err);
    showNotice(err.shortMessage || err.reason || err.message || "Kauf fehlgeschlagen", "error");
  }
}

async function onCheckKyc(project) {
  if (!marketplace || !account) { showNotice("Bitte Wallet verbinden.", "error"); return; }
  try {
    const ok = await marketplace.isInvestorWhitelisted(project.id, account);
    showNotice(
      ok
        ? "Ja, deine Adresse ist für dieses Projekt whitelisted."
        : "Nein, du bist für dieses Projekt noch NICHT whitelisted.",
      ok ? "ok" : "error"
    );
  } catch (err) {
    showNotice(err.message, "error");
  }
}

async function onWhitelist(project, addr, countryStr) {
  if (!ethers.isAddress(addr)) { showNotice("Ungültige Adresse.", "error"); return; }
  const country = Number(countryStr || 0);
  try {
    showNotice("Whitelist-Transaktion wird gesendet...");
    const tx = await marketplace.whitelistInvestor(project.id, addr, country);
    await tx.wait();
    showNotice("Adresse erfolgreich whitelisted.", "ok");
  } catch (err) {
    console.error(err);
    showNotice(err.shortMessage || err.reason || err.message || "Whitelist fehlgeschlagen", "error");
  }
}

async function onRemoveWhitelist(project, addr) {
  if (!ethers.isAddress(addr)) { showNotice("Ungültige Adresse.", "error"); return; }
  try {
    const tx = await marketplace.removeInvestor(project.id, addr);
    await tx.wait();
    showNotice("Adresse entfernt.", "ok");
  } catch (err) {
    showNotice(err.shortMessage || err.message, "error");
  }
}

async function onWithdraw(project) {
  try {
    showNotice("Withdraw wird gesendet...");
    const tx = await marketplace.withdraw(project.id);
    await tx.wait();
    showNotice("USDC ausgezahlt.", "ok");
    await loadProjects();
  } catch (err) {
    showNotice(err.shortMessage || err.reason || err.message || "Withdraw fehlgeschlagen", "error");
  }
}

// ---------------------------------------------------------------------------
// Mock USDC helpers (only visible when USDC address looks like a mock)
// ---------------------------------------------------------------------------
async function refreshMockUsdcCard() {
  const card = $("#mockUsdcCard");
  // Hide the mock card on real Polygon mainnet.
  if (cfg.EXPECTED_CHAIN_ID === 137) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");

  if (!signer) return;
  try {
    const mock = new ethers.Contract(cfg.USDC_ADDRESS, abis.mockUsdc, signer);
    const bal = await mock.balanceOf(account);
    $("#mockUsdcBalance").textContent = `Dein Test-USDC-Guthaben: ${ethers.formatUnits(bal, usdcDecimals)} mUSDC`;
  } catch (_) {
    $("#mockUsdcBalance").textContent = "";
  }
}

async function onMintMock() {
  if (!signer) { showNotice("Bitte Wallet verbinden.", "error"); return; }
  try {
    const mock = new ethers.Contract(cfg.USDC_ADDRESS, abis.mockUsdc, signer);
    const amount = 1000n * 10n ** BigInt(usdcDecimals);
    const tx = await mock.mint(account, amount);
    await tx.wait();
    showNotice("1.000 Test-USDC geprägt.", "ok");
    await refreshMockUsdcCard();
  } catch (err) {
    showNotice(err.shortMessage || err.message || "Mint fehlgeschlagen", "error");
  }
}

// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", init);
