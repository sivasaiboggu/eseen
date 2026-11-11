import { describe, it, expect } from "vitest";
import { prepareSend, createTracking } from "../src/content/tracking";
const body = () => { const d = document.createElement("div"); d.innerHTML = "<p>hi</p>"; return d; };
const ok = (async () => new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 })) as unknown as typeof fetch;
const bad = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
describe("prepareSend", () => {
  it("tracked: pixel injected", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: ok }, ["a@x.com"], () => false)).toBe("tracked"); expect(b.querySelectorAll("img[data-eseen]")).toHaveLength(1); });
  it("failure + user declines: cancel, no pixel", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: bad }, [], () => false)).toBe("cancel"); expect(b.querySelector("img")).toBeNull(); });
  it("offline + user accepts: untracked, no pixel", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: down }, [], () => true)).toBe("untracked"); expect(b.querySelector("img")).toBeNull(); });
  it("always requests combined mode", async () => { let sent: any; const f = (async (_u: any, i: any) => { sent = JSON.parse(i.body); return new Response("{}", { status: 500 }); }) as unknown as typeof fetch; await createTracking({ base: "x", userId: "u", fetch: f }, ["a@x.com"]); expect(sent.mode).toBe("combined"); });
  it("rejects a non-https pixel url from the server", async () => { const f = (async () => new Response(JSON.stringify({ id: "m", pixels: [{ url: "javascript:alert(1)" }] }), { status: 200 })) as unknown as typeof fetch; const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, [], () => false)).toBe("cancel"); });
});
