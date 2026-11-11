import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app";
const secrets = ["s1"];
const H = { authorization: "Bearer u1" };
const path = (u: string) => new URL(u).pathname;
async function setup() {
  let t = 1_700_000_000_000; const clock = { now: () => t, adv: (ms: number) => (t += ms) };
  const { app, store } = buildApp({ secrets, baseUrl: "https://track.test", now: clock.now });
  const res = await app.inject({ method: "POST", url: "/v1/messages", headers: H, payload: { label: "Proposal", recipients: ["to", "cc"], links: ["https://example.com/a"] } });
  return { app, store, clock, body: res.json() };
}
describe("E2E send -> open -> click", () => {
  it("tracks per recipient and filters bots", async () => {
    const { app, clock, body } = await setup();
    const [a, b] = body.recipients;
    expect(a.pixel).not.toBe(b.pixel);
    clock.adv(3000);
    await app.inject({ url: path(a.pixel), headers: { "user-agent": "GoogleImageProxy" } }); // prefetch
    let d = (await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).json();
    expect(d.recipients[0].status).toBe("UNCERTAIN_PREFETCHED");
    clock.adv(120000);
    const px = await app.inject({ url: path(a.pixel), headers: { "user-agent": "Chrome" } });
    expect(px.headers["cache-control"]).toContain("no-store");
    expect(px.headers["content-type"]).toBe("image/gif");
    d = (await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).json();
    expect(d.recipients[0].status).toBe("OPENED");
    expect(d.recipients[1].status).toBe("SENT");
    expect(d.recipients[0].events).toHaveLength(2); // flagged events kept
    clock.adv(10000);
    const c = await app.inject({ url: path(a.links[0].tracked), headers: { "user-agent": "Chrome" } });
    expect(c.statusCode).toBe(302); expect(c.headers.location).toBe("https://example.com/a");
    d = (await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).json();
    expect(d.recipients[0].status).toBe("CLICKED");
  });
  it("forged tokens log nothing and look identical", async () => {
    const { app, store, body } = await setup();
    const r = await app.inject({ url: path(body.recipients[0].pixel).replace(/.$/, "x").replace("gifx", "gif") });
    const r2 = await app.inject({ url: "/p/AAAA.BBBB.gif" });
    expect(r.statusCode).toBe(200); expect(r2.statusCode).toBe(200); expect(store.events).toHaveLength(0);
    expect((await app.inject({ url: "/l/AAAA.BBBB" })).statusCode).toBe(404);
  });
  it("self-open ignored", async () => {
    const { app, clock, body } = await setup(); clock.adv(60000);
    await app.inject({ url: path(body.recipients[0].pixel), headers: { "x-eseen-self": "1" } });
    const d = (await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).json();
    expect(d.recipients[0].status).toBe("SENT");
  });
  it("auth isolation, delete, rejects non-http links", async () => {
    const { app, body } = await setup();
    expect((await app.inject({ url: `/v1/messages/${body.id}`, headers: { authorization: "Bearer u2" } })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/messages" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/messages", headers: H, payload: { recipients: ["to"], links: ["javascript:alert(1)"] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: H })).statusCode).toBe(204);
    expect((await app.inject({ url: `/v1/messages/${body.id}`, headers: H })).statusCode).toBe(404);
  });
  it("opt-out stops logging", async () => {
    const { app, store, clock, body } = await setup(); clock.adv(60000);
    await app.inject({ method: "POST", url: "/v1/optout", payload: { token: path(body.recipients[0].pixel).slice(3) } });
    await app.inject({ url: path(body.recipients[0].pixel) });
    expect(store.events).toHaveLength(0);
  });
});
