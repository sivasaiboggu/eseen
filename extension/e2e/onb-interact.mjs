import { chromium } from "playwright";
import path from "node:path";
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "../dist");
const ctx = await chromium.launchPersistentContext("/tmp/eseen-profile-" + Date.now(), { headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"] });
let extId; for (let i = 0; i < 20 && !extId; i++) { const hit = ctx.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://")); if (hit) extId = hit.url().split("/")[2]; await new Promise((r) => setTimeout(r, 250)); }
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/src/onboarding/index.html`);
const disabled0 = await page.locator("button#go").isDisabled();
await page.locator("#ack").check();
const disabled1 = await page.locator("button#go").isDisabled();
await page.locator("button#later").click();
const page2 = await ctx.newPage();
await page2.goto(`chrome-extension://${extId}/src/onboarding/index.html`);
const v = await page2.evaluate(() => new Promise((r) => chrome.storage.sync.get({ onboarded: false }, r)));
console.log("disabled before:", disabled0, "| after check:", disabled1, "| onboarded saved:", v.onboarded);
await ctx.close();
