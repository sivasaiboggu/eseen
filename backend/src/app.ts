import Fastify from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { classify, deriveStatus, rules } from "@eseen/shared";
import { MemoryStore, type Msg, type Store } from "./store.js";
import { newId, sign, verify } from "./token.js";

// 43-byte transparent GIF
export const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const NO_CACHE = { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0", Pragma: "no-cache", Expires: "0" };
export interface Opts { secrets: string[]; baseUrl: string; store?: Store; now?: () => number; authUser?: (h: Record<string, unknown>) => string | null | Promise<string | null>;
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
    // Dashboard origins: configurable; defaults cover local dev (vite serve + static preview).
    const dash = (process.env.ESEEN_DASHBOARD_ORIGINS ?? "http://localhost:5173,http://localhost:4173").split(",");
    if (o === "https://mail.google.com" || o.startsWith("chrome-extension://") || dash.includes(o)) {
      rep.header("Access-Control-Allow-Origin", o).header("Vary", "Origin").header("Access-Control-Allow-Headers", "authorization, content-type")
        .header("Access-Control-Allow-Methods", "GET, POST, DELETE").header("Access-Control-Allow-Private-Network", "true");
      if (req.method === "OPTIONS") return rep.code(204).send();
    }
  });
  const unauth = (rep: any) => rep.code(401).send({ error: "unauthorized" });

  const ipHits = new Map<string, { n: number; t: number }>(), tokHits = new Map<string, { n: number; t: number }>();
  const over = (m: Map<string, { n: number; t: number }>, k: string, max: number) => { const t = now(), h = m.get(k); if (!h || t - h.t > 60000) { m.set(k, { n: 1, t }); return false; } return ++h.n > max; };

  // async log queue: the pixel response never waits on this
  const queue: (() => Promise<void>)[] = []; let draining = false;
  const drain = () => { if (draining) return; draining = true; setImmediate(() => { void (async () => { while (queue.length) await queue.shift()!(); draining = false; })(); }); };
  const flush = async () => { await new Promise((r) => setImmediate(r)); while (queue.length) await queue.shift()!(); };

  const hash = (salt: string, email: string) => createHash("sha256").update(salt + email.trim().toLowerCase()).digest("hex");

  const create = z.object({
    opId: z.string().max(100).optional(), // client idempotency key: retries after a lost response return the original registration instead of creating an orphan
    subjectLabel: z.string().max(200).optional(), // optional, user-controlled; encrypted at rest in the Postgres impl
    /** Gmail sends ONE body to all recipients. "combined" (default): one pixel, one combined status. "per_recipient": the client sends separate copies, opt-in only. */
    mode: z.enum(["combined", "per_recipient"]).default("combined"),
    recipients: z.array(z.object({ email: z.string().email().max(254), label: z.string().max(80).optional() })).max(100).default([]),
    storeRecipientNames: z.boolean().default(false),
  });
  app.post("/v1/messages", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const p = create.safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    if (p.data.opId) { const hit = await store.getOp(`${userId}:${p.data.opId}`); if (hit) return hit; } // committed earlier; response lost in transit
    const salt = await store.getSalt(userId);
    const id = newId(), m: Msg = { id, userId, subjectEnc: p.data.subjectLabel, sentAt: now(), mode: p.data.mode, recipients: [] };
    if (p.data.mode === "combined") m.recipients.push({ id: newId(), messageId: id, label: "All recipients (combined)" });
    else p.data.recipients.forEach((r) => m.recipients.push({ id: newId(), messageId: id, emailHash: hash(salt, r.email), label: p.data.storeRecipientNames ? r.label : undefined }));
    if (!m.recipients.length) return rep.code(400).send({ error: "per_recipient needs recipients" });
    await store.addMessage(m);
    const created = { id, mode: m.mode, limitation: m.mode === "combined" ? "Gmail sends one copy to everyone, so this status covers all To/Cc/Bcc recipients together." : undefined,
      pixels: m.recipients.map((r) => ({ recipientId: r.id, url: `${o.baseUrl}/p/${sign("p", r.id, o.secrets)}.gif` })) };
    if (p.data.opId) await store.setOp(`${userId}:${p.data.opId}`, created);
    return created;
  });

  const view = async (m: Msg, showAuto: boolean) => ({ id: m.id, label: m.subjectEnc, sentAt: m.sentAt, mode: m.mode, threadId: m.threadId, recipients: await Promise.all(m.recipients.map(async (r) => {
    const evs = (await store.eventsFor(r.id)).filter((e) => e.classification !== "SELF_OPEN");
    return { id: r.id, ...deriveStatus(evs, { sentRecently: now() - m.sentAt < 60000, sendAcked: m.sentAckedAt !== undefined }),
      events: evs.filter((e) => showAuto || e.classification === "REAL_OPEN").map((e) => ({ at: e.at, classification: e.classification, reason: e.reason, uaFamily: e.uaFamily })), recipientLabel: r.label };
  })) });
  app.get("/v1/messages", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), showAuto: z.coerce.boolean().default(true) }).parse(req.query);
    await flush();
    return Promise.all((await store.listMessages(userId, q.limit)).map((m) => view(m, q.showAuto)));
  });
  app.get<{ Params: { id: string } }>("/v1/messages/:id", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const m = await store.getMessage(req.params.id); if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    await flush(); return view(m, true);
  });
  /** Extension signal: sender is viewing their own sent thread. The next first load within the window stays POSSIBLY_OPENED, an unverified timing hint. */
  app.post<{ Params: { id: string } }>("/v1/messages/:id/self-view", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const m = await store.getMessage(req.params.id); if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    await store.setSelfViewUntil(req.params.id, now() + rules.selfViewWindowSeconds * 1000); return rep.code(204).send();
  });
  /** Extension signal: the send was confirmed by a Gmail-level signal (InboxSDK sent event). Idempotent; first ack wins. Registration alone never implies sent. */
  app.post<{ Params: { id: string } }>("/v1/messages/:id/sent-ack", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const m = await store.getMessage(req.params.id); if (!m || m.userId !== userId) return rep.code(404).send({ error: "not found" });
    const p = z.object({ threadId: z.string().max(200).optional() }).partial().safeParse(req.body ?? {});
    if (!p.success) return rep.code(400).send({ error: "invalid" });
    await store.ackSent(req.params.id, now(), p.data.threadId); // first ack wins, id and thread alike
    return rep.code(204).send();
  });
  app.delete("/v1/me", async (req, rep) => { const u = await auth(req.headers); if (!u) return unauth(rep); await store.deleteUser(u); return rep.code(204).send(); });
  app.get("/v1/export", async (req, rep) => { const u = await auth(req.headers); if (!u) return unauth(rep); await flush();
    return Promise.all((await store.listMessages(u, 1000)).map((m) => view(m, true))); });
  app.post("/v1/optout", async (req, rep) => {
    const p = z.object({ token: z.string().max(200) }).safeParse(req.body); if (!p.success) return rep.code(400).send({ error: "invalid" });
    const rid = verify("p", p.data.token.replace(/\.gif$/, ""), o.secrets); if (rid) await store.optOut(rid);
    return rep.code(204).send(); // identical answer for valid and invalid tokens
  });

  // live event stream: one fan-out per user, fed by logged open events
  const subs = new Map<string, Set<(s: string) => void>>();
  const broadcast = (userId: string, payload: unknown) => { const set = subs.get(userId); if (!set) return; const s = `data: ${JSON.stringify(payload)}\n\n`; for (const w of set) { try { w(s); } catch { /* dropped */ } } };
  app.get("/v1/events", async (req, rep) => {
    const userId = await auth(req.headers); if (!userId) return unauth(rep);
    const o = String(req.headers.origin ?? "");
    rep.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", ...(o ? { "access-control-allow-origin": o, vary: "Origin", "access-control-allow-private-network": "true" } : {}) });
    const set = subs.get(userId) ?? new Set(); subs.set(userId, set);
    const w = (s: string) => rep.raw.write(s); set.add(w);
    rep.raw.write(": connected\n\n");
    const ping = setInterval(() => { try { rep.raw.write(": ping\n\n"); } catch { /* closed */ } }, 25000);
    req.raw.on("close", () => { clearInterval(ping); set.delete(w); });
  });
  const lastSeen = new Map<string, number>(); // dedupe: repeats within 3s
  app.get<{ Params: { token: string } }>("/p/:token", async (req, rep) => {
    rep.headers(NO_CACHE);
    const ip = req.ip, ua = String(req.headers["user-agent"] ?? "").slice(0, 300), marker = req.headers["x-eseen-self"] === "1", at = now();
    if (over(ipHits, ip, 300)) return rep.send(GIF); // still a GIF, just not logged
    const rid = verify("p", req.params.token.replace(/\.gif$/, ""), o.secrets);
    if (rid && !over(tokHits, rid, 120)) {
      const ipFlags = o.ipClass?.(ip); // raw IP used here only, never stored
      queue.push(async () => {
        const r = await store.getRecipient(rid); if (!r || (await store.isOptedOut(rid))) return;
        if (at - (lastSeen.get(rid) ?? -1e9) < 3000) return; lastSeen.set(rid, at);
        const m = (await store.getMessage(r.messageId))!, prior = await store.eventsFor(rid);
        const res = classify({ at, userAgent: ua, selfMarker: marker }, { sentAt: m.sentAt, prior, ip: ipFlags, selfViewUntil: m.selfViewUntil });
        const ev = { id: newId(), recipientId: rid, at, ...res, uaFamily: uaFamily(ua), suspectedBot: res.classification === "POSSIBLY_OPENED" };
        await store.addEvent(ev);
        broadcast(m.userId, { messageId: m.id, recipientId: rid, classification: res.classification, at, reason: res.reason });
      });
      drain();
    }
    return rep.send(GIF);
  });
  return { app, store, flush };
}
/** Device type from UA only. */
export function uaFamily(ua: string) { const u = ua.toLowerCase(); return /googleimageproxy|applemail/.test(u) ? "proxy" : /mobile|android|iphone/.test(u) ? "mobile" : /outlook|thunderbird|mail/.test(u) ? "desktop" : u ? "webmail/other" : "unknown"; }
