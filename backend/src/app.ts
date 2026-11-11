import Fastify from "fastify";
import { z } from "zod";
import { classify, evaluate, rules } from "@eseen/shared";
import { MemoryStore, type Msg } from "./store.js";
import { newId, sign, verify } from "./token.js";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
export interface Opts { secrets: string[]; baseUrl: string; store?: MemoryStore; now?: () => number; authUser?: (h: Record<string, unknown>) => string | null; }

export function buildApp(o: Opts) {
  const app = Fastify({ logger: false });
  const store = o.store ?? new MemoryStore();
  const now = o.now ?? Date.now;
  // Dev auth: bearer token = user id. Replace with Google ID-token verification before any real use.
  const auth = o.authUser ?? ((h) => { const a = String(h.authorization ?? ""); return a.startsWith("Bearer ") ? a.slice(7) : null; });
  const hits = new Map<string, { n: number; t: number }>();
  const limited = (key: string) => { const t = now(), h = hits.get(key); if (!h || t - h.t > 60000) { hits.set(key, { n: 1, t }); return false; } return ++h.n > 120; };

  const create = z.object({
    label: z.string().max(200).optional(),
    recipients: z.array(z.enum(["to", "cc", "bcc", "single"])).min(1).max(100),
    links: z.array(z.string().url().max(2048)).max(50).default([]),
  });
  app.post("/v1/messages", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return rep.code(401).send({ error: "unauthorized" });
    const p = create.safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    if (p.data.links.some((u) => !/^https?:\/\//i.test(u))) return rep.code(400).send({ error: "http/https only" });
    const id = newId();
    const m: Msg = { id, userId, label: p.data.label, sentAt: now(), recipients: [], links: [] };
    p.data.recipients.forEach((kind) => m.recipients.push({ id: newId(), messageId: id, kind }));
    for (const r of m.recipients) for (const url of p.data.links) m.links.push({ id: newId(), url, messageId: id, recipientId: r.id });
    store.addMessage(m);
    return {
      id,
      recipients: m.recipients.map((r) => ({ kind: r.kind, pixel: `${o.baseUrl}/p/${sign("p", r.id, o.secrets)}.gif`,
        links: m.links.filter((l) => l.recipientId === r.id).map((l) => ({ url: l.url, tracked: `${o.baseUrl}/l/${sign("l", l.id, o.secrets)}` })) })),
    };
  });

  const statusFor = (m: Msg, showAll = true) => m.recipients.map((r) => {
    const evs = store.events.filter((e) => e.recipientId === r.id);
    return { recipient: r.kind, ...evaluate(evs, m.sentAt), events: showAll ? evs.map(({ id, kind, at, botLabel, suspectedBot, selfOpen }) => ({ id, kind, at, botLabel, suspectedBot, selfOpen })) : undefined };
  });
  app.get("/v1/messages", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return rep.code(401).send({ error: "unauthorized" });
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    return [...store.msgs.values()].filter((m) => m.userId === userId).sort((a, b) => b.sentAt - a.sentAt).slice(0, q.limit)
      .map((m) => ({ id: m.id, label: m.label, sentAt: m.sentAt, recipients: statusFor(m, false) }));
  });
  app.get<{ Params: { id: string } }>("/v1/messages/:id", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return rep.code(401).send({ error: "unauthorized" });
    const m = store.msgs.get(req.params.id);
    if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    return { id: m.id, label: m.label, sentAt: m.sentAt, recipients: statusFor(m) };
  });
  app.delete("/v1/me", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return rep.code(401).send({ error: "unauthorized" });
    store.deleteUser(userId); return rep.code(204).send();
  });
  app.post("/v1/optout", async (req, rep) => {
    const p = z.object({ token: z.string().max(200) }).safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    const rid = verify("p", p.data.token.replace(/\.gif$/, ""), o.secrets); if (rid) store.optouts.add(rid);
    return rep.code(204).send(); // same answer whether or not token was valid (no oracle)
  });

  app.get<{ Params: { token: string } }>("/p/:token", async (req, rep) => {
    rep.header("Cache-Control", "no-store, private, max-age=0").header("Content-Type", "image/gif");
    if (limited("p:" + req.ip)) return rep.code(429).send(GIF);
    const rid = verify("p", req.params.token.replace(/\.gif$/, ""), o.secrets);
    const r = rid && store.recips.get(rid);
    if (r && !store.optouts.has(r.id)) {
      const m = store.msgs.get(r.messageId)!;
      const at = now(), ua = String(req.headers["user-agent"] ?? "").slice(0, 300);
      const self = req.headers["x-eseen-self"] === "1"; // set by the extension for the sender's own browser
      const label = classify({ kind: "open", at, userAgent: ua }, m.sentAt, rules);
      store.events.push({ id: newId(), recipientId: r.id, kind: "open", at, userAgent: ua, suspectedBot: label !== null, botLabel: label, selfOpen: self });
    }
    return rep.send(GIF); // always the same image: no oracle for token guessing
  });
  app.get<{ Params: { token: string } }>("/l/:token", async (req, rep) => {
    if (limited("l:" + req.ip)) return rep.code(429).send();
    const lid = verify("l", req.params.token, o.secrets);
    const l = lid && store.links.get(lid);
    if (!l || !/^https?:\/\//i.test(l.url)) return rep.code(404).send();
    const m = store.msgs.get(l.messageId)!, at = now(), ua = String(req.headers["user-agent"] ?? "").slice(0, 300);
    const label = classify({ kind: "click", at, userAgent: ua }, m.sentAt, rules);
    store.events.push({ id: newId(), recipientId: l.recipientId, kind: "click", at, userAgent: ua, suspectedBot: label !== null, botLabel: label });
    return rep.code(302).header("Location", l.url).header("Cache-Control", "no-store").send(); // destination is only what the signed token maps to: no open redirect
  });
  return { app, store };
}
