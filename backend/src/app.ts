import Fastify from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { classify, deriveStatus, rules } from "@eseen/shared";
import { MemoryStore, type Msg } from "./store.js";
import { newId, sign, verify } from "./token.js";

// 43-byte transparent GIF
export const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const NO_CACHE = { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0", Pragma: "no-cache", Expires: "0" };
export interface Opts { secrets: string[]; baseUrl: string; store?: MemoryStore; now?: () => number; authUser?: (h: Record<string, unknown>) => string | null;
  /** Maps a raw request IP to coarse flags using rules.ipRanges. Raw IP never leaves this call. */ ipClass?: (ip: string) => { apple?: boolean; scanner?: boolean; datacenter?: boolean }; }

export function buildApp(o: Opts) {
  const app = Fastify({ logger: false });
  const store = o.store ?? new MemoryStore();
  const now = o.now ?? Date.now;
  // DEV AUTH ONLY: bearer token = user id. Replace with Google ID-token verification before any real use.
  const auth = o.authUser ?? ((h) => { const a = String(h.authorization ?? ""); return a.startsWith("Bearer ") ? a.slice(7) : null; });
  // CORS: only the Gmail origin (extension content script runs with the page's origin). PNA header for localhost dev.
  app.addHook("onRequest", async (req, rep) => {
    const o = String(req.headers.origin ?? "");
    // Allowed: the Gmail origin (content scripts run with the page's origin) and our own extension pages (popup/dashboard, dev API).
    if (o === "https://mail.google.com" || o.startsWith("chrome-extension://")) {
      rep.header("Access-Control-Allow-Origin", o).header("Vary", "Origin").header("Access-Control-Allow-Headers", "authorization, content-type")
        .header("Access-Control-Allow-Methods", "GET, POST, DELETE").header("Access-Control-Allow-Private-Network", "true");
      if (req.method === "OPTIONS") return rep.code(204).send();
    }
  });
  // CORS: only the Gmail origin (extension content script runs with the page's origin). PNA header for localhost dev.
  app.addHook("onRequest", async (req, rep) => {
    const o = String(req.headers.origin ?? "");
    // Allowed: the Gmail origin (content scripts run with the page's origin) and our own extension pages (popup/dashboard, dev API).
    if (o === "https://mail.google.com" || o.startsWith("chrome-extension://")) {
      rep.header("Access-Control-Allow-Origin", o).header("Vary", "Origin").header("Access-Control-Allow-Headers", "authorization, content-type")
        .header("Access-Control-Allow-Methods", "GET, POST, DELETE").header("Access-Control-Allow-Private-Network", "true");
      if (req.method === "OPTIONS") return rep.code(204).send();
    }
  });
  const unauth = (rep: any) => rep.code(401).send({ error: "unauthorized" });

  const ipHits = new Map<string, { n: number; t: number }>(), tokHits = new Map<string, { n: number; t: number }>();
  const over = (m: Map<string, { n: number; t: number }>, k: string, max: number) => { const t = now(), h = m.get(k); if (!h || t - h.t > 60000) { m.set(k, { n: 1, t }); return false; } return ++h.n > max; };

  // async log queue: the pixel response never waits on this
  const queue: (() => void)[] = []; let draining = false;
  const drain = () => { if (draining) return; draining = true; setImmediate(() => { while (queue.length) queue.shift()!(); draining = false; }); };
  const flush = async () => { await new Promise((r) => setImmediate(r)); while (queue.length) queue.shift()!(); };

  const salt = (u: string) => { let s = store.salts.get(u); if (!s) store.salts.set(u, (s = randomBytes(16).toString("hex"))); return s; };
  const hash = (u: string, email: string) => createHash("sha256").update(salt(u) + email.trim().toLowerCase()).digest("hex");

  const create = z.object({
    subjectLabel: z.string().max(200).optional(), // optional, user-controlled; encrypted at rest in the Postgres impl
    /** Gmail sends ONE body to all recipients. "combined" (default): one pixel, one combined status. "per_recipient": the client sends separate copies, opt-in only. */
    mode: z.enum(["combined", "per_recipient"]).default("combined"),
    recipients: z.array(z.object({ email: z.string().email().max(254), label: z.string().max(80).optional() })).max(100).default([]),
    storeRecipientNames: z.boolean().default(false),
  });
  app.post("/v1/messages", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return unauth(rep);
    const p = create.safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    const id = newId(), m: Msg = { id, userId, subjectEnc: p.data.subjectLabel, sentAt: now(), mode: p.data.mode, recipients: [] };
    if (p.data.mode === "combined") m.recipients.push({ id: newId(), messageId: id, label: "All recipients (combined)" });
    else p.data.recipients.forEach((r) => m.recipients.push({ id: newId(), messageId: id, emailHash: hash(userId, r.email), label: p.data.storeRecipientNames ? r.label : undefined }));
    if (!m.recipients.length) return rep.code(400).send({ error: "per_recipient needs recipients" });
    store.addMessage(m);
    return { id, mode: m.mode, limitation: m.mode === "combined" ? "Gmail sends one copy to everyone, so this status covers all To/Cc/Bcc recipients together." : undefined,
      pixels: m.recipients.map((r) => ({ recipientId: r.id, url: `${o.baseUrl}/p/${sign("p", r.id, o.secrets)}.gif` })) };
  });

  const view = (m: Msg, showAuto: boolean) => ({ id: m.id, label: m.subjectEnc, sentAt: m.sentAt, mode: m.mode, recipients: m.recipients.map((r) => {
    const evs = store.eventsFor(r.id).filter((e) => e.classification !== "SELF_OPEN");
    return { id: r.id, label: r.label, ...deriveStatus(evs, { sentRecently: now() - m.sentAt < 60000 }),
      events: evs.filter((e) => showAuto || e.classification === "REAL_OPEN").map((e) => ({ at: e.at, classification: e.classification, reason: e.reason, uaFamily: e.uaFamily })) };
  }) });
  app.get("/v1/messages", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return unauth(rep);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), showAuto: z.coerce.boolean().default(true) }).parse(req.query);
    await flush();
    return [...store.msgs.values()].filter((m) => m.userId === userId).sort((a, b) => b.sentAt - a.sentAt).slice(0, q.limit).map((m) => view(m, q.showAuto));
  });
  app.get<{ Params: { id: string } }>("/v1/messages/:id", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return unauth(rep);
    const m = store.msgs.get(req.params.id); if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    await flush(); return view(m, true);
  });
  /** Extension signal: sender is viewing their own sent thread. The next first load within the window counts as SELF_OPEN (heuristic). */
  app.post<{ Params: { id: string } }>("/v1/messages/:id/self-view", async (req, rep) => {
    const userId = auth(req.headers); if (!userId) return unauth(rep);
    const m = store.msgs.get(req.params.id); if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    m.selfViewUntil = now() + rules.selfViewWindowSeconds * 1000; return rep.code(204).send();
  });
  app.delete("/v1/me", async (req, rep) => { const u = auth(req.headers); if (!u) return unauth(rep); store.deleteUser(u); return rep.code(204).send(); });
  app.get("/v1/export", async (req, rep) => { const u = auth(req.headers); if (!u) return unauth(rep); await flush();
    return [...store.msgs.values()].filter((m) => m.userId === u).map((m) => view(m, true)); });
  app.post("/v1/optout", async (req, rep) => {
    const p = z.object({ token: z.string().max(200) }).safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    const rid = verify("p", p.data.token.replace(/\.gif$/, ""), o.secrets); if (rid) store.optouts.add(rid);
    return rep.code(204).send(); // identical answer for valid and invalid tokens
  });

  const lastSeen = new Map<string, number>(); // dedupe: repeats within 3s
  app.get<{ Params: { token: string } }>("/p/:token", async (req, rep) => {
    rep.headers(NO_CACHE);
    const ip = req.ip, ua = String(req.headers["user-agent"] ?? "").slice(0, 300), marker = req.headers["x-eseen-self"] === "1", at = now();
    if (over(ipHits, ip, 300)) return rep.send(GIF); // still a GIF, just not logged
    const rid = verify("p", req.params.token.replace(/\.gif$/, ""), o.secrets);
    if (rid && !over(tokHits, rid, 120)) {
      const ipFlags = o.ipClass?.(ip); // raw IP used here only, never stored
      queue.push(() => {
        const r = store.recips.get(rid); if (!r || store.optouts.has(rid)) return;
        if (at - (lastSeen.get(rid) ?? -1e9) < 3000) return; lastSeen.set(rid, at);
        const m = store.msgs.get(r.messageId)!, prior = store.eventsFor(rid);
        const res = classify({ at, userAgent: ua, selfMarker: marker }, { sentAt: m.sentAt, prior, ip: ipFlags, selfViewUntil: m.selfViewUntil });
        store.events.push({ id: newId(), recipientId: rid, at, ...res, uaFamily: uaFamily(ua), suspectedBot: res.classification === "POSSIBLY_OPENED" });
      });
      drain();
    }
    return rep.send(GIF);
  });
  return { app, store, flush };
}
/** Device type from UA only. */
export function uaFamily(ua: string) { const u = ua.toLowerCase(); return /googleimageproxy|applemail/.test(u) ? "proxy" : /mobile|android|iphone/.test(u) ? "mobile" : /outlook|thunderbird|mail/.test(u) ? "desktop" : u ? "webmail/other" : "unknown"; }
