import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const be = spawn("npx", ["tsx", "src/server.ts"], { cwd: new URL("../../backend", import.meta.url).pathname, env: { ...process.env, ESEEN_SECRETS: "s1", PORT: "8787" }, stdio: "ignore" });
for (let i = 0; ; i++) { try { await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } }); break; } catch { if (i > 30) throw new Error("backend never came up"); await new Promise((r) => setTimeout(r, 500)); } }
// seed two tracked messages with one open
const H = { authorization: "Bearer dev-user", "content-type": "application/json" };
const m1 = await (await fetch("http://localhost:8787/v1/messages", { method: "POST", headers: H, body: JSON.stringify({ mode: "per_recipient", recipients: [{ email: "priya@example.com", label: "Priya" }], storeRecipientNames: true, subjectLabel: "Q3 proposal" }) })).json();
await fetch(m1.pixels[0].url.replace("http://localhost:8787", "http://localhost:8787"), { headers: { "user-agent": "Mozilla/5.0 Chrome/150" } });
await new Promise((r) => setTimeout(r, 4000));
await fetch(m1.pixels[0].url, { headers: { "user-agent": "Mozilla/5.0 Chrome/150" } });
await (await fetch("http://localhost:8787/v1/messages", { method: "POST", headers: H, body: JSON.stringify({ recipients: [{ email: "sam@example.com" }] }) })).json();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = createServer((req, res) => { const p = join(new URL("../../dashboard/dist", import.meta.url).pathname, req.url === "/" ? "index.html" : req.url.split("?")[0]); if (!existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": mime[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p)); });
await new Promise((r) => srv.listen(4173, r));
const ctx = await chromium.launchPersistentContext("/tmp/eseen-dash-" + Date.now(), { headless: false, args: ["--headless=new", "--no-sandbox"] }); const browser = ctx; const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto("http://localhost:4173/"); await page.waitForTimeout(1500); const errs = []; page.on("console", (m) => errs.push(m.text())); await page.reload(); await page.waitForSelector("table tbody tr", { timeout: 8000 }).catch(async (e) => { console.log("HTML:", await page.content().then((c) => c.slice(0, 400))); console.log("CONSOLE:", errs.join(" | ").slice(0, 300)); throw e; });
await page.screenshot({ path: "/tmp/eseen-check-shots/dashboard.png" });
await browser.close(); srv.close(); be.kill();
console.log("DASH SHOT OK");
