// E2E: compose -> send -> simulated pixel hits -> status. Uses a MOCK page served at a mail.google.com URL via request interception (no real Gmail traffic).
import { chromium } from "playwright"; import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, ".."); const dist = path.join(root, "dist"); const shots = process.argv[2] ?? "/tmp/eseen-shots"; fs.mkdirSync(shots, { recursive: true });
const be = spawn("npx", ["tsx", "src/server.ts"], { cwd: path.join(root, "../backend"), env: { ...process.env, ESEEN_SECRETS: "e2e-secret", PORT: "8787", BASE_URL: "https://mail.google.com/api" }, detached: true, stdio: "inherit" });
for (let i = 0; i < 40; i++) { try { await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
const ctx = await chromium.launchPersistentContext("/tmp/eseen-profile-" + Date.now(), { headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch,BlockInsecurePrivateNetworkRequests", "--no-sandbox"] });
try {
  const html = fs.readFileSync(path.join(root, "e2e/mock-gmail.html"), "utf8");
  await ctx.route("https://mail.google.com/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
  await ctx.route("https://mail.google.com/api/**", async (route) => { // loopback proxy: the page never touches a private address space
    const u = new URL(route.request().url());
    const resp = await route.fetch({ url: "http://localhost:8787" + u.pathname.replace(/^\/api/, "") + u.search });
    await route.fulfill({ response: resp });
  });
  await ctx.route("https://mail.google.com/api/p/**", (r) => r.abort()); // the mock page must not load the pixel itself; the e2e simulates opens via direct fetches
  const page = await ctx.newPage(); page.on("console", (m) => console.log("page:", m.text())); page.on("pageerror", (e) => console.log("pageerror:", e.message)); page.on("dialog", (d) => { console.log("dialog:", d.message()); void d.accept(); });
  await page.goto("https://mail.google.com/mock");
  await page.waitForSelector("#send"); await page.waitForTimeout(1500);
  const toggles = await page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.shadowRoot?.querySelector("input[type=checkbox]")).length);
  assert.equal(toggles, 1, "Eseen toggle injected beside Send");
  await page.click("#send"); await page.waitForTimeout(2500);
  const sent = await page.evaluate(() => window.__sent); assert.ok(sent, "send went through");
  const m = sent.match(/<img[^>]*data-eseen[^>]*src="([^"]+)"/) ?? sent.match(/<img[^>]*src="([^"]+)"[^>]*data-eseen/); assert.ok(m, "pixel present in sent body: " + sent);
  assert.match(sent, /style="display:none"/); assert.ok(sent.includes("Proposal v2 attached."), "visible text unchanged");
  const pixel = m[1]; console.log("pixel:", pixel.replace(/\/p\/.*/, "/p/<token>.gif"));
  const get = async (ua) => { const r = await fetch(pixel.replace("https://mail.google.com/api", "http://localhost:8787"), { headers: { "user-agent": ua } }); assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 43); };
  const list = async () => (await (await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } })).json())[0];
  let msg = await list(); assert.equal(msg.recipients.length, 1); assert.equal(msg.mode, "combined");
  await get("Mozilla/5.0 AppleMail"); await new Promise((r) => setTimeout(r, 300)); msg = await list();
  assert.equal(msg.recipients[0].status, "POSSIBLY_OPENED"); console.log("after Apple proxy hit:", msg.recipients[0].label);
  await new Promise((r) => setTimeout(r, 3200)); await get("Mozilla/5.0 Chrome/150"); await new Promise((r) => setTimeout(r, 300)); msg = await list();
  assert.equal(msg.recipients[0].status, "OPENED"); console.log("after real-looking hit:", msg.recipients[0].label, "opens:", msg.recipients[0].openCount);
  await page.screenshot({ path: path.join(shots, "mock-compose.png") });
  // popup
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker"); const id = sw.url().split("/")[2];
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 560 }); await pop.goto(`chrome-extension://${id}/src/popup/index.html`); await pop.waitForSelector("li"); 
  assert.match(await pop.textContent("li"), /Opened/); await pop.screenshot({ path: path.join(shots, "popup.png") });
  await pop.emulateMedia({ colorScheme: "dark" });
  await pop.screenshot({ path: path.join(shots, "popup-dark.png") });
  await pop.emulateMedia({ colorScheme: "light" });
  await fetch("http://localhost:8787/v1/me", { method: "DELETE", headers: { authorization: "Bearer dev-user" } });
  await pop.reload(); await pop.getByText("Your next signal starts here").waitFor();
  await pop.screenshot({ path: path.join(shots, "popup-empty.png") });
  console.log("E2E PASS");
} finally { await ctx.close(); try { process.kill(-be.pid); } catch { be.kill(); } }
