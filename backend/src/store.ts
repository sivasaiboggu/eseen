import type { StoredOpen } from "@eseen/shared";
import { randomBytes } from "node:crypto";
export interface Recipient { id: string; messageId: string; emailHash?: string; label?: string; }
export interface Msg { id: string; userId: string; subjectEnc?: string; sentAt: number; mode: "combined" | "per_recipient"; recipients: Recipient[]; selfViewUntil?: number; sentAckedAt?: number; muted?: boolean; threadId?: string; }
export interface EventRow extends StoredOpen { id: string; recipientId: string; country?: string; suspectedBot: boolean; }
/** Storage seam: every method is async so the Postgres adapter shares the contract. Raw IPs are never stored. */
export interface Store {
  getSalt(u: string): Promise<string>; // creates and persists one on first use
  getOp(key: string): Promise<unknown>;
  setOp(key: string, v: unknown): Promise<void>;
  addMessage(m: Msg): Promise<void>;
  getMessage(id: string): Promise<Msg | undefined>;
  listMessages(userId: string, limit: number): Promise<Msg[]>;
  getRecipient(id: string): Promise<Recipient | undefined>;
  eventsFor(rid: string): Promise<EventRow[]>;
  addEvent(e: EventRow): Promise<void>;
  isOptedOut(rid: string): Promise<boolean>;
  optOut(rid: string): Promise<void>;
  deleteUser(u: string): Promise<void>;
  purgeOlderThan(ts: number): Promise<void>;
  setSelfViewUntil(id: string, ts: number): Promise<void>;
  ackSent(id: string, at: number, threadId?: string): Promise<void>; // first ack wins, id and thread alike
}
export class MemoryStore implements Store {
  msgs = new Map<string, Msg>(); recips = new Map<string, Recipient>(); events: EventRow[] = []; optouts = new Set<string>(); salts = new Map<string, string>();
  ops = new Map<string, unknown>(); // owner-scoped idempotency: `${userId}:${opId}` -> original registration response
  async getSalt(u: string) { let s = this.salts.get(u); if (!s) this.salts.set(u, (s = randomBytes(16).toString("hex"))); return s; }
  async getOp(key: string) { return this.ops.get(key); }
  async setOp(key: string, v: unknown) { this.ops.set(key, v); }
  async addMessage(m: Msg) { this.msgs.set(m.id, m); m.recipients.forEach((r) => this.recips.set(r.id, r)); }
  async getMessage(id: string) { return this.msgs.get(id); }
  async listMessages(userId: string, limit: number) { return [...this.msgs.values()].filter((m) => m.userId === userId).sort((a, b) => b.sentAt - a.sentAt).slice(0, limit); }
  async getRecipient(id: string) { return this.recips.get(id); }
  async eventsFor(rid: string) { return this.events.filter((e) => e.recipientId === rid); }
  async addEvent(e: EventRow) { this.events.push(e); }
  async isOptedOut(rid: string) { return this.optouts.has(rid); }
  async optOut(rid: string) { this.optouts.add(rid); }
  async deleteUser(userId: string) {
    for (const m of [...this.msgs.values()].filter((m) => m.userId === userId)) {
      this.msgs.delete(m.id);
      m.recipients.forEach((r) => { this.recips.delete(r.id); this.events = this.events.filter((e) => e.recipientId !== r.id); });
    }
    this.salts.delete(userId);
    for (const k of [...this.ops.keys()]) if (k.startsWith(`${userId}:`)) this.ops.delete(k);
  }
  async purgeOlderThan(ts: number) { this.events = this.events.filter((e) => e.at >= ts); }
  async setSelfViewUntil(id: string, ts: number) { const m = this.msgs.get(id); if (m) m.selfViewUntil = ts; }
  async ackSent(id: string, at: number, threadId?: string) { const m = this.msgs.get(id); if (!m) return; if (m.sentAckedAt === undefined) m.sentAckedAt = at; if (m.threadId === undefined && threadId) m.threadId = threadId; }
}
