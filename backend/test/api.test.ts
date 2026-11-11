import { describe, it, expect } from "vitest";
import { buildApp, GIF } from "../src/app";
const H = { authorization: "Bearer u1" };
const path = (u: string) => new URL(u).pathname;
async function setup(payload: any = {}) {
  let t = 1_700_000_000_000; const clock = { now: () => t, adv: (ms: number) => (t += ms) };
  const { app, store, flush } = buildApp({ secrets: ["s1"], baseUrl: "https://track.test", now: clock.now });
  const body = (await app.inject({ method: "POST", url: "/v1/messages", headers: H, payload })).json();
  const get = async () => { await flush(); return (await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).json(); };
  const hit = (ua = "Chrome", extra: any = {}) => app.inject({ url: path(body.pixels[0].url), headers: { "user-agent": ua, ...extra } });
  return { app, store, clock, body, get, hit };
}
describe("pixel endpoint", () => {
  it("43-byte GIF, 200, no-cache headers", async () => {
    const { hit } = await setup(); const r = await hit();
    expect(r.statusCode).toBe(200); expect(r.rawPayload.length).toBe(43); expect(GIF.length).toBe(43);
    expect(r.headers["cache-control"]).toBe("no-store, no-cache, must-revalidate, private, max-age=0");
    expect(r.headers.pragma).toBe("no-cache"); expect(r.headers.expires).toBe("0");
  });
  it("invalid tokens: same 200 GIF, nothing logged", async () => {
    const { app, store } = await setup();
    for (const u of ["/p/AAAA.BBBB.gif", "/p/zzz.gif", "/p/.gif"]) { const r = await app.inject({ url: u }); expect(r.statusCode).toBe(200); expect(r.rawPayload.length).toBe(43); }
    expect(store.events).toHaveLength(0);
  });
  it("responds fast", async () => { const { hit } = await setup(); const t0 = performance.now(); await hit(); expect(performance.now() - t0).toBeLessThan(50); });
  it("dedupes repeats within 3s", async () => {
    const { hit, clock, get } = await setup(); clock.adv(120000); await hit(); clock.adv(1000); await hit(); clock.adv(5000); await hit();
    expect((await get()).recipients[0].openCount).toBe(2);
  });
});
describe("send acknowledgement", () => {
  it("registration alone stays unconfirmed; ack promotes to SENT; duplicate ack keeps the first time", async () => {
    const { app, body, get, clock } = await setup();
    expect((await get()).recipients[0].status).toBe("REGISTERED");
    expect((await get()).recipients[0].label).toBe("Set up - send unconfirmed");
    const ack = await app.inject({ method: "POST", url: `/v1/messages/${body.id}/sent-ack`, headers: H });
    expect(ack.statusCode).toBe(204);
    expect((await get()).recipients[0].status).toBe("SENT");
    clock.adv(5000);
    await app.inject({ method: "POST", url: `/v1/messages/${body.id}/sent-ack`, headers: H });
    expect((await get()).recipients[0].status).toBe("SENT");
  });
  it("rejects acks for unknown or foreign messages", async () => {
    const { app, body } = await setup();
    expect((await app.inject({ method: "POST", url: `/v1/messages/${body.id}/sent-ack`, headers: { authorization: "Bearer other" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/messages/nope/sent-ack", headers: H })).statusCode).toBe(404);
  });
  it("a pixel load never promotes an unconfirmed registration to SENT", async () => {
    const { hit, clock, get } = await setup(); clock.adv(5000); await hit("Chrome"); await hit("Chrome");
    const m = await get();
    expect(m.recipients[0].status).not.toBe("SENT");
  });
});
describe("live events stream", () => {
  it("requires auth and streams logged open events", async () => {
    const { app, hit, clock } = await setup();
    expect((await app.inject({ url: "/v1/events" })).statusCode).toBe(401);
    await app.listen({ port: 0 });
    try {
      const port = (app.server.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/v1/events`, { headers: H });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain(": connected");
      clock.adv(1000); await hit("Chrome");
      const chunk = await reader.read();
      expect(new TextDecoder().decode(chunk.value)).toContain("REAL_OPEN");
      await reader.cancel();
    } finally { await app.close(); }
  });
});
describe("status flow", () => {
  it("combined mode by default, with the limitation stated", async () => {
    const { body } = await setup({ recipients: [{ email: "a@x.com" }, { email: "b@x.com" }] });
    expect(body.mode).toBe("combined"); expect(body.pixels).toHaveLength(1); expect(body.limitation).toMatch(/one copy/);
  });
  it("send -> real open -> OPENED; apple -> possibly", async () => {
    const { hit, clock, get } = await setup(); clock.adv(1000);
    await hit("AppleMail"); clock.adv(5000);
    expect((await get()).recipients[0].status).toBe("POSSIBLY_OPENED"); expect((await get()).recipients[0].label).toBe("Possibly opened (auto-loaded)");
    clock.adv(600000); await hit("Chrome");
    const r = (await get()).recipients[0]; expect(r.status).toBe("OPENED"); expect(r.events).toHaveLength(2); // flagged event kept
  });
  it("explicit self marker is ignored", async () => {
    const { app, body, hit, clock, get } = await setup(); clock.adv(100000);
    await hit("Chrome", { "x-eseen-self": "1" });
    expect((await get()).recipients[0].status).toBe("REGISTERED"); // no open recorded; send also unconfirmed
    await app.inject({ method: "POST", url: `/v1/messages/${body.id}/sent-ack`, headers: H });
    expect((await get()).recipients[0].status).toBe("NOT_OPENED_YET"); // confirmed send + ignored self load
  });
  it("self-view timing guess stays visible as possibly opened", async () => {
    const { app, hit, clock, get, body } = await setup(); clock.adv(100000);
    await app.inject({ method: "POST", url: `/v1/messages/${body.id}/self-view`, headers: H }); clock.adv(5000);
    await hit("Chrome"); const r = (await get()).recipients[0];
    expect(r.status).toBe("POSSIBLY_OPENED"); expect(r.events[0].reason).toMatch(/unverified/);
  });
  it("per_recipient mode hashes emails, no addresses stored", async () => {
    const { store, body } = await setup({ mode: "per_recipient", recipients: [{ email: "Priya@x.com", label: "Priya" }] });
    expect(body.pixels).toHaveLength(1); const r = [...store.recips.values()][0];
    expect(r.emailHash).toMatch(/^[0-9a-f]{64}$/); expect(r.label).toBeUndefined(); expect(JSON.stringify([...store.recips.values()])).not.toMatch(/priya/i);
  });
  it("opt-out stops logging", async () => {
    const { app, body, hit, store, clock } = await setup(); clock.adv(1e5);
    await app.inject({ method: "POST", url: "/v1/optout", payload: { token: path(body.pixels[0].url).slice(3) } }); await hit();
    await new Promise((r) => setImmediate(r)); expect(store.events).toHaveLength(0);
  });
  it("auth isolation, export, delete", async () => {
    const { app, body } = await setup();
    expect((await app.inject({ url: `/v1/messages/${body.id}`, headers: { authorization: "Bearer u2" } })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/messages" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/export", headers: H })).json()).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: H })).statusCode).toBe(204);
    expect((await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).statusCode).toBe(404);
  });
});
