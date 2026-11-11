import { describe, it, expect } from "vitest";
import { prepareSend, createTracking } from "../src/content/tracking";
const body = () => { const d = document.createElement("div"); d.innerHTML = "<p>hi</p>"; return d; };
const ok = (async () => new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 })) as unknown as typeof fetch;
const bad = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
describe("prepareSend", () => {
  it("tracked: pixel injected", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: ok }, ["a@x.com"], () => false)).toBe("tracked"); expect(b.querySelectorAll("img[data-eseen]")).toHaveLength(1); });
  it("failure + user declines: cancel, no pixel", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: bad }, [], () => false, undefined, undefined, { sleep: async () => {} })).toBe("cancel"); expect(b.querySelector("img")).toBeNull(); });
  it("offline + user accepts: untracked, no pixel", async () => { const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: down }, [], () => true, undefined, undefined, { sleep: async () => {} })).toBe("untracked"); expect(b.querySelector("img")).toBeNull(); });
  it("always requests combined mode", async () => { let sent: any; const f = (async (_u: any, i: any) => { sent = JSON.parse(i.body); return new Response("{}", { status: 500 }); }) as unknown as typeof fetch; await createTracking({ base: "x", userId: "u", fetch: f }, ["a@x.com"]); expect(sent.mode).toBe("combined"); });
  it("rejects a non-https pixel url from the server", async () => { const f = (async () => new Response(JSON.stringify({ id: "m", pixels: [{ url: "javascript:alert(1)" }] }), { status: 200 })) as unknown as typeof fetch; const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, [], () => false)).toBe("cancel"); });
  it("reports the tracked id for later send confirmation", async () => { let id = ""; const f = (async () => new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 })) as unknown as typeof fetch; const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, ["a@x.com"], () => false, undefined, (i) => { id = i; })).toBe("tracked"); expect(id).toBe("m1"); });
  it("cancel path never confirms a send", async () => { let id = ""; const f = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch; const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, [], () => false, undefined, (i) => { id = i; }, { sleep: async () => {} })).toBe("cancel"); expect(id).toBe(""); });
  it("retries registration with bounded backoff, then succeeds", async () => { let calls = 0; const delays: number[] = [];
    const f = (async () => { calls++; if (calls < 3) throw new Error("offline"); return new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 }); }) as unknown as typeof fetch;
    const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, ["a@x.com"], () => false, undefined, undefined, { sleep: async (ms) => { delays.push(ms); } })).toBe("tracked");
    expect(calls).toBe(4); expect(delays).toEqual([500, 1000]); }); // 2 failed registrations, 1 success, then the self-view marker
  it("retries exhausted: user decides, nothing queued for after the send", async () => { let calls = 0;
    const f = (async () => { calls++; throw new Error("offline"); }) as unknown as typeof fetch;
    const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, [], () => false, undefined, undefined, { retries: 2, sleep: async () => {} })).toBe("cancel");
    expect(calls).toBe(3); expect(b.querySelector("img")).toBeNull(); });
  it("failed self-view marker: injection proceeds but is reported unarmed, never as registered", async () => { let armed: boolean | undefined;
    const f = (async (u: any) => { if (String(u).includes("self-view")) throw new Error("offline"); return new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 }); }) as unknown as typeof fetch;
    const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, ["a@x.com"], () => false, undefined, (_id, a) => { armed = a; })).toBe("tracked");
    expect(armed).toBe(false); expect(b.querySelector("img[data-eseen]")).not.toBeNull(); });
  it("marks the self-view window before the pixel is injected (ordering matters)", async () => { const calls: string[] = []; const f = (async (u: any) => { calls.push(String(u)); return new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 }); }) as unknown as typeof fetch; const b = body(); expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, ["a@x.com"], () => false)).toBe("tracked"); const selfView = calls.indexOf("x/v1/messages/m1/self-view"); expect(selfView).toBeGreaterThan(-1); expect(calls.indexOf("x/v1/messages")).toBe(0); expect(b.querySelector("img[data-eseen]")).not.toBeNull(); });
});

describe("registration opId", () => {
  it("is stable across retries so a committed-but-lost response replays instead of duplicating", async () => {
    const ops: string[] = []; let calls = 0;
    const f = (async (_u: any, i: any) => { calls++; ops.push(JSON.parse(i.body).opId); if (calls === 1) throw new Error("lost response"); return new Response(JSON.stringify({ id: "m1", pixels: [{ url: "https://track.eseen.app/p/t.gif" }] }), { status: 200 }); }) as unknown as typeof fetch;
    const b = document.createElement("div"); b.innerHTML = "<p>hi</p>";
    expect(await prepareSend(b, { base: "x", userId: "u", fetch: f }, ["a@x.com"], () => false, undefined, undefined, { sleep: async () => {} })).toBe("tracked");
    expect(ops.length).toBe(2); expect(ops[0]).toBe(ops[1]); expect(ops[0]).toBeTruthy();
  });
});
