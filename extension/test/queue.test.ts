import { describe, it, expect, beforeEach } from "vitest";
import { flushQueue, postSignal, enqueue, type SignalStore, type QueuedSignal } from "../src/content/queue";
const memStore = (): SignalStore & { all: QueuedSignal[] } => { const all: QueuedSignal[] = []; return { all,
  entries: async () => all.map((value, key) => ({ key, value })),
  add: async (s) => { all.push(s); },
  delete: async (key) => { all.splice(key as number, 1); } }; };
const api = (mode: "ok" | "down" | "500" | "404") => ({ base: "x", userId: "u", fetch: (async () => {
  if (mode === "down") throw new Error("offline");
  return new Response(null, { status: mode === "ok" ? 204 : mode === "500" ? 500 : 404 });
}) as unknown as typeof fetch });
describe("offline signal queue", () => {
  let store: ReturnType<typeof memStore>;
  beforeEach(() => { store = memStore(); });
  it("queues a failed signal and flushes it when the backend returns", async () => {
    expect(await postSignal(api("down"), "/v1/messages/m1/sent-ack", store)).toBe(false);
    expect(store.all.length).toBe(1);
    expect(await flushQueue(api("ok"), store, Date.now() + 61_000)).toBe(1); // flushes once the first backoff elapses
    expect(store.all.length).toBe(0);
  });
  it("never treats a queued signal as delivered", async () => { expect(await postSignal(api("500"), "/v1/messages/m1/self-view", store)).toBe(false); });
  it("does not queue 4xx rejections", async () => { expect(await postSignal(api("404"), "/v1/messages/m1/sent-ack", store)).toBe(false); expect(store.all.length).toBe(0); });
  it("backs off: a fresh entry is not retried immediately", async () => {
    await enqueue({ path: "/v1/messages/m1/sent-ack", queuedAt: 1_000_000, attempts: 0 }, store);
    expect(await flushQueue(api("ok"), store, 1_000_000 + 5_000)).toBe(0); // inside the 60s backoff
    expect(await flushQueue(api("ok"), store, 1_000_000 + 61_000)).toBe(1); // after it
  });
  it("expires self-view markers after the 90s window (a late marker would misattribute)", async () => {
    await enqueue({ path: "/v1/messages/m1/self-view", queuedAt: 1_000_000, attempts: 0 }, store);
    expect(await flushQueue(api("ok"), store, 1_000_000 + 91_000)).toBe(0);
    expect(store.all.length).toBe(0);
  });
  it("drops entries after 10 attempts", async () => {
    await enqueue({ path: "/v1/messages/m1/sent-ack", queuedAt: 1_000_000, attempts: 10 }, store);
    expect(await flushQueue(api("ok"), store, 1_000_000 + 3_600_000)).toBe(0);
    expect(store.all.length).toBe(0);
  });
  it("caps the queue at 50", async () => { for (let i = 0; i < 60; i++) await enqueue({ path: `/p/${i}`, queuedAt: i, attempts: 0 }, store); expect(store.all.length).toBe(50); });
});
