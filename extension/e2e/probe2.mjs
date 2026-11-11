import { chromium } from "playwright"; import path from "node:path"; import fs from "node:fs";
const dist = path.resolve("dist");
const ctx = await chromium.launchPersistentContext("/tmp/eseen-probe-" + Date.now(), { headless: false,
  args: ["--headless=new", `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"] });
try {
  const html = fs.readFileSync("e2e/mock-gmail.html", "utf8");
  await ctx.route("https://mail.google.com/api/**", async (route) => {
    const u = new URL(route.request().url());
    try {
      const resp = await route.fetch({ url: "http://localhost:8787" + u.pathname.replace(/^\/api/, "") + u.search });
      console.log("proxied", u.pathname, "->", resp.status());
      await route.fulfill({ response: resp });
    } catch (e) { console.log("proxy error:", e.message); await route.fulfill({ status: 599, body: String(e) }); }
  });
  await ctx.route("https://mail.google.com/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
  const page = await ctx.newPage(); page.on("console", (m) => console.log("page:", m.text())); page.on("requestfailed", (r) => console.log("reqfail:", r.url(), r.failure()?.errorText));
  await page.goto("https://mail.google.com/mock"); await page.waitForTimeout(1500);
  await page.click("#send"); await page.waitForTimeout(2500);
  console.log("sent:", await page.evaluate(() => window.__sent));
} finally { await ctx.close(); }
