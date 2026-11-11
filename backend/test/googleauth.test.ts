import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { googleAuth } from "../src/googleauth.js";
import { buildApp } from "../src/app.js";
const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...kp.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (payload: object, kid = "k1") => {
  const h = b64u({ alg: "RS256", kid }), p = b64u(payload);
  return `${h}.${p}.${cryptoSign("RSA-SHA256", Buffer.from(`${h}.${p}`), kp.privateKey).toString("base64url")}`;
};
const now = 1_700_000_000_000;
const auth = googleAuth({ clientId: "cid", fetchJwks: async () => ({ keys: [jwk] }), now: () => now });
const valid = () => token({ iss: "https://accounts.google.com", aud: "cid", sub: "123", exp: Math.floor(now / 1000) + 600 });
describe("verified Google identity", () => {
  it("accepts a valid token and namespaces the subject", async () => expect(await auth(valid())).toBe("g:123"));
  it("rejects wrong audience", async () => expect(await auth(token({ iss: "https://accounts.google.com", aud: "other", sub: "1", exp: Math.floor(now / 1000) + 600 }))).toBeNull());
  it("rejects expired", async () => expect(await auth(token({ iss: "https://accounts.google.com", aud: "cid", sub: "1", exp: Math.floor(now / 1000) - 10 }))).toBeNull());
  it("rejects bad issuer and unknown kid", async () => {
    expect(await auth(token({ iss: "https://evil.example", aud: "cid", sub: "1", exp: Math.floor(now / 1000) + 600 }))).toBeNull();
    expect(await auth(token({ iss: "https://accounts.google.com", aud: "cid", sub: "1", exp: Math.floor(now / 1000) + 600 }, "nope"))).toBeNull();
  });
  it("rejects a forged signature", async () => {
    const t = valid().split("."); t[2] = Buffer.from("forged").toString("base64url");
    expect(await auth(t.join("."))).toBeNull();
  });
  it("when configured, dev bearer no longer authenticates", async () => {
    const { app } = buildApp({ secrets: ["s1"], baseUrl: "https://track.test", authUser: (h) => { const a = String(h.authorization ?? ""); return a.startsWith("Bearer ") ? auth(a.slice(7)) : null; } });
    expect((await app.inject({ url: "/v1/messages", headers: { authorization: "Bearer dev-user" } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/messages", headers: { authorization: `Bearer ${valid()}` } })).statusCode).toBe(200);
  });
});
