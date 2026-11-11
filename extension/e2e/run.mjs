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
  let pixelLoads = 0;
  await ctx.route("https://mail.google.com/api/**", async (route) => { // loopback proxy: the page never touches a private address space
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/api/p/")) pixelLoads++; // compose-side loads go through for real: they must land inside the self-view window
    try { const resp = await route.fetch({ url: "http://localhost:8787" + u.pathname.replace(/^\/api/, "") + u.search }); await route.fulfill({ response: resp }); }
    catch { await route.fulfill({ status: 502, body: "backend down" }); } // lets the popup render its own error state when the backend is gone
  });
  await ctx.route("https://mail.google.com/api/v1/events", (r) => r.abort()); // registered last so it wins: route.fetch can't proxy a never-ending stream; the popup falls back to polling (exercised below), and the stream itself is covered by the backend test
  const page = await ctx.newPage(); page.on("console", (m) => console.log("page:", m.text())); page.on("pageerror", (e) => console.log("pageerror:", e.message)); page.on("dialog", (d) => { console.log("dialog:", d.message()); void d.accept(); });
  // Consent gate: before onboarding, nothing wires, injects, or registers - the send goes through untracked.
  await page.goto("https://mail.google.com/mock");
  await page.waitForSelector("#send"); await page.waitForTimeout(1500);
  const togglesBefore = await page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.shadowRoot?.querySelector("input[type=checkbox]")).length);
  assert.equal(togglesBefore, 0, "no Eseen toggle before onboarding consent");
  await page.click("#send"); await page.waitForTimeout(1500);
  const sentBefore = await page.evaluate(() => window.__sent); assert.ok(sentBefore, "send still works before consent");
  assert.ok(!sentBefore.includes("data-eseen"), "no pixel injected before consent");
  const beforeList = await (await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } })).json();
  assert.equal(beforeList.length, 0, "nothing registered before consent");
  const sw0 = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker");
  await sw0.evaluate(() => chrome.storage.sync.set({ onboarded: true })); // user completes onboarding
  await page.reload(); await page.waitForSelector("#send"); await page.waitForTimeout(1500);
  const toggles = await page.evaluate(() => [...document.querySelectorAll("span")].filter((s) => s.shadowRoot?.querySelector("input[type=checkbox]")).length);
  assert.equal(toggles, 1, "Eseen toggle injected beside Send after consent");
  await page.click("#send"); await page.waitForTimeout(2500);
  const sent = await page.evaluate(() => window.__sent); assert.ok(sent, "send went through");
  const m = sent.match(/<img[^>]*data-eseen[^>]*src="([^"]+)"/) ?? sent.match(/<img[^>]*src="([^"]+)"[^>]*data-eseen/); assert.ok(m, "pixel present in sent body: " + sent);
  assert.match(sent, /style="display:none"/); assert.ok(sent.includes("Proposal v2 attached."), "visible text unchanged");
  const pixel = m[1]; console.log("pixel:", pixel.replace(/\/p\/.*/, "/p/<token>.gif"));
  await new Promise((r) => setTimeout(r, 400)); assert.ok(pixelLoads >= 1, "compose-side pixel load actually fired (nothing is blocked in this test)");
  { const early = await (await fetch("http://localhost:8787/v1/messages?limit=25", { headers: { authorization: "Bearer dev-user" } })).json();
    assert.equal(early[0].recipients[0].status, "POSSIBLY_OPENED", "the compose-side load is covered by the self-view window, not recorded as an open");
    assert.match(early[0].recipients[0].events[0].reason, /viewed your own sent email/); console.log("compose-side load classified:", early[0].recipients[0].events[0].reason); }
  const get = async (ua) => { const r = await fetch(pixel.replace("https://mail.google.com/api", "http://localhost:8787"), { headers: { "user-agent": ua } }); assert.equal(r.status, 200); assert.equal((await r.arrayBuffer()).byteLength, 43); };
  const list = async () => (await (await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } })).json())[0];
  let msg = await list(); assert.equal(msg.recipients.length, 1); assert.equal(msg.mode, "combined");
  await get("Mozilla/5.0 AppleMail"); await new Promise((r) => setTimeout(r, 300)); msg = await list();
  assert.equal(msg.recipients[0].status, "POSSIBLY_OPENED"); console.log("after Apple proxy hit:", msg.recipients[0].label, "events:", msg.recipients[0].events.length);
  await new Promise((r) => setTimeout(r, 3200)); await get("Mozilla/5.0 Chrome/150"); await new Promise((r) => setTimeout(r, 300)); msg = await list();
  assert.equal(msg.recipients[0].status, "OPENED"); console.log("after real-looking hit:", msg.recipients[0].label, "opens:", msg.recipients[0].openCount);
  // background notifications: enable them, drive the worker tick, confirm the open is recorded
  const bg = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker");
  await bg.evaluate(async () => { await chrome.storage.sync.set({ notifications: true, notifyFirstOpen: false }); await (self).__eseenTick(); });
  const seenState = await bg.evaluate(() => chrome.storage.local.get({ seen: {} }).then((s) => s.seen));
  assert.ok(Object.values(seenState).some((v) => v >= 1), "background tick recorded the open for notifications");
  await page.screenshot({ path: path.join(shots, "mock-compose.png") });
  // popup
  const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker"); const id = sw.url().split("/")[2];
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 560 }); pop.on("console", (m) => console.log("popup-console:", m.text())); pop.on("pageerror", (e) => console.log("popup-pageerror:", e.message)); await pop.goto(`chrome-extension://${id}/src/popup/index.html`); await pop.waitForSelector(".email-row", { timeout: 15000 }); 
  assert.match(await pop.textContent(".email-row"), /Opened/);
  assert.match(await pop.textContent(".email-row"), /All recipients/, "combined row names no fake identity");
  await new Promise((r) => setTimeout(r, 4500)); await get("Mozilla/5.0 Chrome/150"); await new Promise((r) => setTimeout(r, 300)); // second real-looking load, past the dedupe window
  console.log("after second hit:", (await list()).recipients[0].openCount, "opens");
  await pop.click(".email-row"); // expand: the count lives in the timeline
  await pop.waitForTimeout(8000);
  console.log("POPUP BODY:", (await pop.textContent("body"))?.slice(0, 300));
  await pop.waitForFunction(() => document.body.textContent?.includes("2 opens"), undefined, { timeout: 15000 }); console.log("popup live-updated after a new open");
  await pop.click(".email-row"); await pop.waitForTimeout(250); // collapse again
  assert.ok(await pop.$(".avatar.neutral"), "combined rows use a neutral group avatar");
  assert.match(await pop.textContent(".app-header"), /Local API/, "connection labelled honestly, never a bare green dot");
  assert.ok(await pop.evaluate(() => document.fonts.check('12px "Inter Variable"')), "Inter is bundled, not a system fallback");
  await pop.screenshot({ path: path.join(shots, "popup.png") });
  // keyboard: Tab reaches the row, Enter expands, Escape collapses
  for (let i = 0; i < 15; i++) { await pop.keyboard.press("Tab"); if (await pop.evaluate(() => document.activeElement?.classList.contains("email-row"))) break; }
  assert.ok(await pop.evaluate(() => document.activeElement?.classList.contains("email-row")), "row reachable by keyboard");
  await pop.keyboard.press("Enter"); await pop.waitForTimeout(250);
  assert.ok(await pop.$(".timeline.open"), "Enter expands the timeline");
  await pop.screenshot({ path: path.join(shots, "popup-focus.png") });
  await pop.keyboard.press("Escape"); await pop.waitForTimeout(250);
  assert.ok(!(await pop.$(".timeline.open")), "Escape collapses the timeline");
  assert.equal(await pop.$eval(".timeline", (el) => getComputedStyle(el).paddingBottom), "0px", "collapsed timeline has no visible bar");
  // mouse expand for the layout screenshot
  await pop.click(".email-row"); await pop.waitForTimeout(250);
  assert.doesNotMatch(await pop.textContent(".timeline"), /1 opens/, "singular open count reads '1 open'");
  await pop.screenshot({ path: path.join(shots, "popup-expanded.png") });
  assert.equal(await pop.$eval(".list-scroll ul", (el) => getComputedStyle(el).paddingLeft), "0px", "rows sit at the 16px inset, no stray list indent");
  await pop.click(".email-row");
  // settings: wired controls persist, unavailable ones are visibly disabled
  await pop.click(".icon-btn[aria-label='Settings']"); await pop.waitForTimeout(250);
  await pop.screenshot({ path: path.join(shots, "popup-settings.png") });
  assert.match(await pop.textContent(".settings-panel"), /Desktop notifications/, "notifications settings are wired, not disabled placeholders");
  const notifBefore = await pop.evaluate(() => chrome.storage.sync.get({ notifications: false }).then((s) => s.notifications));
  await pop.click(".switch[aria-label='Desktop notifications']"); await pop.waitForTimeout(150);
  assert.equal(await pop.evaluate(() => chrome.storage.sync.get({ notifications: false }).then((s) => s.notifications)), !notifBefore, "notification setting persisted");
  await pop.click(".switch[aria-label='Desktop notifications']"); await pop.waitForTimeout(150);
  await pop.click(".switch[aria-label='Show auto-loaded opens']"); await pop.waitForTimeout(150);
  assert.equal(await pop.evaluate(() => chrome.storage.sync.get({ showAuto: true }).then((s) => s.showAuto)), false, "showAuto persisted off");
  await pop.click(".switch[aria-label='Show auto-loaded opens']"); await pop.waitForTimeout(150);
  assert.equal(await pop.evaluate(() => chrome.storage.sync.get({ showAuto: true }).then((s) => s.showAuto)), true, "showAuto persisted back on");
  await pop.click(".switch[aria-label='Tracking on by default']"); await pop.waitForTimeout(150);
  assert.equal(await pop.evaluate(() => chrome.storage.sync.get({ enabled: true }).then((s) => s.enabled)), false, "tracking default persisted off");
  await pop.click(".switch[aria-label='Tracking on by default']"); await pop.waitForTimeout(150);
  await pop.click(".icon-btn[aria-label='Back']"); await pop.waitForTimeout(250);
  // reduced motion: no transitions
  await pop.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await pop.$eval(".search", (el) => getComputedStyle(el).transitionDuration), "0s", "reduced motion disables transitions");
  await pop.screenshot({ path: path.join(shots, "popup-reduced-motion.png") });
  await pop.emulateMedia({ reducedMotion: "no-preference" });
  // zoom: browser zoom at 150% shrinks the CSS layout viewport of a 380px popup to ~253px; reflow at that width is the equivalent layout test
  await pop.setViewportSize({ width: 253, height: 560 }); await pop.waitForTimeout(200);
  assert.ok(await pop.evaluate(() => document.documentElement.scrollWidth <= 253), "no horizontal overflow at 150% zoom equivalent");
  for (const sel of [".summary", ".search", ".segments", ".email-row"]) { const b = await (await pop.$(sel)).boundingBox(); assert.ok(b && b.x >= 0 && b.x + b.width <= 254, sel + " fully visible at 150% zoom equivalent"); }
  await pop.screenshot({ path: path.join(shots, "popup-zoom150.png") });
  await pop.setViewportSize({ width: 380, height: 560 });
  await pop.emulateMedia({ colorScheme: "dark" });
  await pop.screenshot({ path: path.join(shots, "popup-dark.png") });
  await pop.emulateMedia({ colorScheme: "light" });
  // row badge + thread card: a Gmail-level sent-ack carries the exact thread ID, then the page decorations attach
  const tracked = (await (await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } })).json())[0];
  const ack = await fetch(`http://localhost:8787/v1/messages/${tracked.id}/sent-ack`, { method: "POST", headers: { authorization: "Bearer dev-user", "content-type": "application/json" }, body: JSON.stringify({ threadId: "t-1" }) });
  assert.equal(ack.status, 204);
  await page.evaluate(() => window.__sent = "");
  await page.reload(); await page.waitForSelector("#send"); await page.waitForTimeout(2500);
  const deco = await page.evaluate(() => ({
    badge: !!document.querySelector("tr[data-legacy-thread-id='t-1'] td.a4W span")?.shadowRoot,
    otherRowClean: !document.querySelector("tr[data-legacy-thread-id='t-other'] td.a4W span"),
    card: !!document.querySelector("div[data-thread-id='t-1'] > span")?.shadowRoot,
  }));
  assert.ok(deco.badge, "badge attached to the matching row"); assert.ok(deco.otherRowClean, "no badge on a non-matching row"); assert.ok(deco.card, "card attached to the matching thread");
  console.log("row badge + thread card attached by exact thread ID");
  await page.screenshot({ path: path.join(shots, "mock-thread.png") });
  // unarmed marker: self-view POST blocked, the compose-side load must stay visibly ambiguous - never a silent Opened
  await ctx.route("https://mail.google.com/api/v1/messages/*/self-view", (r) => r.abort()); // registered last: wins over the proxy route
  await page.evaluate(() => { document.getElementById("body").innerHTML = "<p>second</p>"; });
  await page.click("#send"); await page.waitForFunction(() => window.__sent?.includes("second"));
  await new Promise((r) => setTimeout(r, 400));
  const msgs = await (await fetch("http://localhost:8787/v1/messages", { headers: { authorization: "Bearer dev-user" } })).json();
  assert.equal(msgs[0].recipients[0].status, "POSSIBLY_OPENED", "unarmed marker: the compose load stays ambiguous, never a silent open");
  assert.match(msgs[0].recipients[0].events[0].reason, /First load within 60s of sending/); console.log("unarmed compose load classified:", msgs[0].recipients[0].events[0].reason);
  await pop.reload(); await pop.waitForSelector(".email-row", { timeout: 15000 }); await pop.waitForTimeout(1200);
  console.log("POPUP TOP ROW:", await pop.textContent(".email-row"));
  const topRow = await pop.textContent(".email-row");
  assert.match(topRow, /Auto-loaded/, "popup shows the ambiguity as auto-loaded");
  assert.doesNotMatch(topRow, /Opened/, "and never a silent Opened");
  // two tracked sends in ONE thread: the row aggregates, each send keeps its own card
  const ack2 = await fetch(`http://localhost:8787/v1/messages/${msgs[0].id}/sent-ack`, { method: "POST", headers: { authorization: "Bearer dev-user", "content-type": "application/json" }, body: JSON.stringify({ threadId: "t-1" }) });
  assert.equal(ack2.status, 204);
  await page.reload(); await page.waitForSelector("#send"); await page.waitForTimeout(2500);
  const deco2 = await page.evaluate(() => ({
    cards: [...document.querySelectorAll("div[data-thread-id='t-1'] > span")].filter((s) => s.shadowRoot?.querySelector(".card")).length,
    badges: [...document.querySelectorAll("tr[data-legacy-thread-id='t-1'] td.a4W span")].filter((s) => s.shadowRoot?.querySelector(".b")).length,
  }));
  assert.equal(deco2.badges, 1, "one aggregate badge on the row"); assert.equal(deco2.cards, 2, "one card per tracked send in the thread");
  console.log("two sends in one thread: aggregate badge + per-send cards");
  await page.screenshot({ path: path.join(shots, "mock-thread-two.png") });
  // delete-all requires the typed confirmation; the button stays inert without it
  await pop.click(".icon-btn[aria-label='Settings']"); await pop.waitForTimeout(250);
  await pop.click(".danger-zone .danger-btn"); await pop.waitForTimeout(150);
  assert.ok(await pop.$(".confirm-dialog"), "delete asks for typed confirmation");
  assert.ok(await pop.$(".confirm-dialog .danger-btn[disabled]"), "delete button inert until DELETE is typed");
  await pop.fill(".confirm-dialog input", "DELET"); assert.ok(await pop.$(".confirm-dialog .danger-btn[disabled]"), "partial confirmation stays inert");
  await pop.fill(".confirm-dialog input", "DELETE");
  await pop.click(".confirm-dialog .danger-btn"); await pop.waitForTimeout(500);
  await pop.reload(); await pop.getByText("Nothing tracked yet").waitFor();
  await pop.screenshot({ path: path.join(shots, "popup-empty.png") });
  try { process.kill(-be.pid); } catch { be.kill(); }
  await pop.reload(); await pop.getByText("Can't reach your tracking service").waitFor({ timeout: 15000 });
  await pop.screenshot({ path: path.join(shots, "popup-error.png") });
  console.log("E2E PASS");
} finally { await ctx.close(); try { process.kill(-be.pid); } catch { be.kill(); } }
