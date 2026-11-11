import { describe, it, expect } from "vitest";
import { decorate, trackedByThread } from "../src/content/rows";
const msg = (threadId?: string) => ({ id: "m1", threadId, mode: "combined", recipients: [{ id: "r1", label: "All recipients (combined)", events: [{ at: 1000, classification: "REAL_OPEN", reason: "No automation signal found" }] }] });
const api = (list: unknown[]) => ({ base: "x", userId: "u", fetch: (async () => new Response(JSON.stringify(list), { status: 200 })) as unknown as typeof fetch });
const doc = (tid: string) => { const d = document.createElement("div"); d.innerHTML = `<table><tr data-legacy-thread-id="${tid}"><td class="a4W">Subject</td></tr></table><div data-thread-id="${tid}"><p>body</p></div>`; return d; };
describe("row/thread decoration", () => {
  it("badges only rows whose exact thread ID matches a tracked message", async () => {
    const d = doc("t-1");
    const n = await decorate(d, api([msg("t-1")]), { showAuto: false, now: Date.now() + 31_000 });
    expect(n).toBe(2); // one badge + one card
    expect((d.querySelector("td.a4W")!.lastElementChild as HTMLElement).shadowRoot).not.toBeNull(); // badge host (content lives in shadow DOM)
    expect((d.querySelector("div[data-thread-id]")!.firstElementChild as HTMLElement).shadowRoot).not.toBeNull(); // card host
  });
  it("never guesses: a message without a threadId decorates nothing", async () => {
    const d = doc("t-1");
    expect(await decorate(d, api([msg(undefined)]), { showAuto: false, now: Date.now() + 62_000 })).toBe(0);
    expect((d.querySelector("td.a4W") as HTMLElement).children.length).toBe(0);
  });
  it("is idempotent across scans", async () => {
    const d = doc("t-1");
    await decorate(d, api([msg("t-1")]), { showAuto: false, now: Date.now() + 93_000 });
    expect(await decorate(d, api([msg("t-1")]), { showAuto: false, now: Date.now() + 124_000 })).toBe(0);
    expect(d.querySelector("div[data-thread-id]")!.children.length).toBe(1 + 1); // the body paragraph + exactly one card host
  });
  it("caches the message list within the freshness window", async () => {
    let calls = 0; const f = (async () => { calls++; return new Response(JSON.stringify([msg("t-9")]), { status: 200 }); }) as unknown as typeof fetch;
    const a = { base: "x", userId: "u", fetch: f };
    await trackedByThread(a, Date.now() + 500_000); await trackedByThread(a, Date.now() + 510_000); // within the freshness window of the first call
    expect(calls).toBe(1);
  });
});
