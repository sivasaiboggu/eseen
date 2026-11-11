import type { Pool } from "pg";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EventRow, Msg, Recipient, Store } from "./store.js";
/** Postgres adapter, same async contract as MemoryStore. Raw IPs are never stored; subjects/display labels are stored only when the user opted in (encryption-at-rest is a deployment concern noted in the README). */
// AES-256-GCM envelope for opt-in subject/label columns. Format: iv(12) || tag(16) || ciphertext.
export function makeCipher(key?: Buffer) {
  if (!key) return { enc: (s: string) => Buffer.from(s), dec: (b: Buffer) => b.toString(), active: false };
  return {
    active: true,
    enc: (s: string) => { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key, iv); return Buffer.concat([iv, c.update(s, "utf8"), c.final(), c.getAuthTag()]); },
    dec: (b: Buffer) => { const iv = b.subarray(0, 12), tag = b.subarray(b.length - 16), ct = b.subarray(12, b.length - 16); const d = createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString("utf8"); },

  };
}
const asBuf = (v: unknown): Buffer => typeof v === "string" && /^[0-9a-f]+$/i.test(v) ? Buffer.from(v, "hex") : Buffer.isBuffer(v) ? v : typeof v === "string" && v.startsWith("\\x") ? Buffer.from(v.slice(2), "hex") : Buffer.from(String(v));
export class PgStore implements Store {
  private cipher: ReturnType<typeof makeCipher>;
  private constructor(private pool: Pool, dataKey?: Buffer) { this.cipher = makeCipher(dataKey && dataKey.length === 32 ? dataKey : undefined); }
  static async connect(pool: Pool, opts?: { dataKey?: Buffer; requireKey?: boolean }): Promise<PgStore> {
    if (opts?.requireKey && (!opts.dataKey || opts.dataKey.length !== 32)) throw new Error("ESEEN_DATA_KEY must be 32 bytes (base64); refusing to run with plaintext subject/label storage");
    const dir = new URL("../migrations/", import.meta.url);
    for (const f of ["001_init.sql", "002_message_state_ops.sql"]) await pool.query(readFileSync(new URL(f, dir), "utf8"));
    return new PgStore(pool, opts?.dataKey);
  }
  private guardPlaintext(plain?: string) { if (plain !== undefined && !this.cipher.active) throw new Error("opt-in subject/label storage refused: no data key configured"); }
  private async ensureUser(u: string) { await this.pool.query("insert into users(id, email, email_salt) values ($1, $2, $3) on conflict (id) do nothing", [u, u, randomBytes(16).toString("hex")]); }
  async getSalt(u: string) { await this.ensureUser(u); const r = await this.pool.query("select email_salt from users where id = $1", [u]); return r.rows[0].email_salt as string; }
  async getOp(key: string) { const q = await this.pool.query("select response from ops where user_id || ':' || op_id = $1", [key]); return q.rows[0]?.response; }
  async setOp(key: string, v: unknown) { const i = key.indexOf(":"); await this.pool.query("insert into ops(user_id, op_id, response) values ($1, $2, $3) on conflict (user_id, op_id) do nothing", [key.slice(0, i), key.slice(i + 1), JSON.stringify(v)]); }
  async addMessage(m: Msg) {
    await this.ensureUser(m.userId);
    this.guardPlaintext(m.subjectEnc); for (const r of m.recipients) this.guardPlaintext(r.label);
    await this.pool.query("insert into messages(id, user_id, subject_encrypted, mode, sent_at, self_view_until, sent_acked_at, thread_id, muted) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [m.id, m.userId, m.subjectEnc ? this.cipher.enc(m.subjectEnc).toString("hex") : null, m.mode, new Date(m.sentAt), m.selfViewUntil ? new Date(m.selfViewUntil) : null, m.sentAckedAt ? new Date(m.sentAckedAt) : null, m.threadId ?? null, m.muted ?? false]);
    for (const r of m.recipients) await this.pool.query("insert into recipients(id, message_id, email_hash, display_label_encrypted) values ($1,$2,$3,$4)", [r.id, r.messageId, r.emailHash ?? null, r.label ? this.cipher.enc(r.label).toString("hex") : null]);
  }
  private async toMsg(row: any): Promise<Msg> {
    const rs = await this.pool.query("select id, message_id, email_hash, display_label_encrypted from recipients where message_id = $1", [row.id]);
    return { id: row.id, userId: row.user_id, subjectEnc: row.subject_encrypted ? this.cipher.dec(asBuf(row.subject_encrypted)) : undefined, sentAt: new Date(row.sent_at).getTime(), mode: row.mode,
      selfViewUntil: row.self_view_until ? new Date(row.self_view_until).getTime() : undefined, sentAckedAt: row.sent_acked_at ? new Date(row.sent_acked_at).getTime() : undefined, threadId: row.thread_id ?? undefined, muted: row.muted ?? undefined,
      recipients: rs.rows.map((r: any): Recipient => ({ id: r.id, messageId: r.message_id, emailHash: r.email_hash ?? undefined, label: r.display_label_encrypted ? this.cipher.dec(asBuf(r.display_label_encrypted)) : undefined })) };
  }
  private readonly MSG_COLS = "id, user_id, subject_encrypted, mode, sent_at, self_view_until, sent_acked_at, thread_id, muted";
  async getMessage(id: string) { const r = await this.pool.query(`select ${this.MSG_COLS} from messages where id = $1`, [id]); return r.rows[0] ? this.toMsg(r.rows[0]) : undefined; }
  async listMessages(userId: string, limit: number) { const r = await this.pool.query(`select ${this.MSG_COLS} from messages where user_id = $1 order by sent_at desc limit $2`, [userId, limit]); return Promise.all(r.rows.map((row) => this.toMsg(row))); }
  async getRecipient(id: string) { const r = await this.pool.query("select id, message_id, email_hash, display_label_encrypted from recipients where id = $1", [id]); const row = r.rows[0]; return row ? { id: row.id, messageId: row.message_id, emailHash: row.email_hash ?? undefined, label: row.display_label_encrypted ? this.cipher.dec(asBuf(row.display_label_encrypted)) : undefined } : undefined; }
  async eventsFor(rid: string): Promise<EventRow[]> { const r = await this.pool.query("select * from events where recipient_id = $1 order by occurred_at", [rid]); return r.rows.map((e: any) => ({ id: e.id, recipientId: e.recipient_id, at: new Date(e.occurred_at).getTime(), classification: e.classification, reason: e.reason, uaFamily: e.ua_family ?? undefined, country: e.country ?? undefined, suspectedBot: e.suspected_bot })); }
  async addEvent(e: EventRow) { await this.pool.query("insert into events(id, recipient_id, occurred_at, classification, reason, ua_family, country, suspected_bot) values ($1,$2,$3,$4,$5,$6,$7,$8)", [e.id, e.recipientId, new Date(e.at), e.classification, e.reason, e.uaFamily ?? null, e.country ?? null, e.suspectedBot]); }
  async isOptedOut(rid: string) { return (await this.pool.query("select 1 from optouts where recipient_id = $1", [rid])).rowCount! > 0; }
  async optOut(rid: string) { await this.pool.query("insert into optouts(recipient_id) values ($1) on conflict do nothing", [rid]); }
  async deleteUser(u: string) { await this.pool.query("delete from users where id = $1", [u]); await this.pool.query("delete from ops where user_id = $1", [u]); } // messages/recipients/events cascade
  async purgeOlderThan(ts: number) { await this.pool.query("delete from events where occurred_at < $1", [new Date(ts)]); }
  async setSelfViewUntil(id: string, ts: number) { await this.pool.query("update messages set self_view_until = $2 where id = $1", [id, new Date(ts)]); }
  async ackSent(id: string, at: number, threadId?: string) { await this.pool.query("update messages set sent_acked_at = coalesce(sent_acked_at, $2), thread_id = coalesce(thread_id, $3) where id = $1", [id, new Date(at), threadId ?? null]); }
}
