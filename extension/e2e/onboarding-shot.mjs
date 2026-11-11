import { chromium } from "playwright";
import path from "node:path";
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "../dist");
const ctx = await chromium.launchPersistentContext("/tmp/eseen-profile-" + Date.now(), { headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"] });
const page = await ctx.newPage();
// find the extension id from a service worker target
let extId; for (let i = 0; i < 20 && !extId; i++) { const sw = ctx.serviceWorkers(); const hit = sw.find((w) => w.url().startsWith("chrome-extension://")); if (hit) extId = hit.url().split("/")[2]; await new Promise((r) => setTimeout(r, 250)); }
await page.goto(`chrome-extension://${extId}/src/onboarding/index.html`);
await page.waitForSelector("button#go", { timeout: 10000 });
await page.screenshot({ path: "/tmp/eseen-check-shots/onboarding.png" });
await ctx.close();
console.log("ONBOARDING SHOT OK");
