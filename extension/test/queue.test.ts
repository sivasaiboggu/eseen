import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, flushQueue, postSignal } from "../src/content/queue";
const mem: Record<string, unknown> = {};
(globalThis as any).chrome = { storage: { local: { get: async (k: string) => ({ [k]: mem[k] }), set: async (o: Record<string, unknown>) => { Object.assign(mem, o); } } } };
const api = (ok: boolean) => ({ base: "x", userId: "u", fetch: (async () => { if (!ok) throw new Error("offline"); return new Response(null, { status: 204 }); }) as unknown as typeof fetch });
describe("offline signal queue", () => {
  beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });
  it("queues a failed signal and flushes it when the backend returns", async () => {
    await postSignal(api(false), "/v1/messages/m1/sent-ack");
    expect(((mem as any).eseenSignalQueue ?? []).length).toBe(1);
    expect(await flushQueue(api(true))).toBe(1);
    expect(((mem as any).eseenSignalQueue ?? []).length).toBe(0);
  });
  it("keeps failures queued for the next tick", async () => {
    await enqueue({ path: "/v1/messages/m1/self-view" });
    expect(await flushQueue(api(false))).toBe(0);
    expect(((mem as any).eseenSignalQueue ?? []).length).toBe(1);
  });
  it("caps the queue", async () => { for (let i = 0; i < 60; i++) await enqueue({ path: `/p/${i}` }); expect(((mem as any).eseenSignalQueue ?? []).length).toBe(50); });
});
