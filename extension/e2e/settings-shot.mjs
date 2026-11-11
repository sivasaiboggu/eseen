import { chromium } from "playwright";
import path from "node:path";
import { spawn } from "node:child_process";
const be = spawn("npx", ["tsx", "src/server.ts"], { cwd: new URL("../../backend", import.meta.url).pathname, env: { ...process.env, ESEEN_SECRETS: "s1", PORT: "8787" }, stdio: "ignore" });
for (let i = 0; ; i++) { try { await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } }); break; } catch { if (i > 40) throw new Error("backend never came up"); await new Promise((r) => setTimeout(r, 500)); } }
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "../dist");
const ctx = await chromium.launchPersistentContext("/tmp/eseen-profile-" + Date.now(), { headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"] });
let extId; for (let i = 0; i < 20 && !extId; i++) { const hit = ctx.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://")); if (hit) extId = hit.url().split("/")[2]; await new Promise((r) => setTimeout(r, 250)); }
const page = await ctx.newPage(); await page.setViewportSize({ width: 380, height: 600 });
await page.goto(`chrome-extension://${extId}/src/popup/index.html`);
await page.waitForSelector("main", { timeout: 60000 });
console.log("buttons:", await page.locator("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || b.textContent).join(" | ")));
await page.locator("button[aria-label='Settings']").click();
await page.waitForSelector(".settings-panel", { timeout: 5000 });
await page.screenshot({ path: "/tmp/eseen-check-shots/popup-settings-auth.png" });
await ctx.close();
be.kill(); console.log("SETTINGS SHOT OK");
