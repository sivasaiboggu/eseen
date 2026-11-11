import { chromium } from "playwright"; import path from "node:path"; import fs from "node:fs";
const dist = path.resolve("dist");
const ctx = await chromium.launchPersistentContext("/tmp/eseen-probe-" + Date.now(), { executablePath: "/usr/bin/google-chrome", headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"] });
console.log("version:", ctx.browser().version());
await new Promise(r => setTimeout(r, 3000));
console.log("serviceWorkers:", ctx.serviceWorkers().map(w => w.url()));
const html = fs.readFileSync("e2e/mock-gmail.html", "utf8");
await ctx.route("https://mail.google.com/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
const page = await ctx.newPage();
page.on("console", (m) => console.log("page:", m.type(), m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("https://mail.google.com/mock"); await page.waitForTimeout(4000);
console.log("toggles:", await page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.shadowRoot?.querySelector("input[type=checkbox]")).length));
console.log("hasChromeStorage:", await page.evaluate(() => typeof chrome !== "undefined" && !!chrome.storage));
await ctx.close();
