import type { StoredOpen } from "@eseen/shared";
export interface Recipient { id: string; messageId: string; emailHash?: string; label?: string; }
export interface Msg { id: string; userId: string; subjectEnc?: string; sentAt: number; mode: "combined" | "per_recipient"; recipients: Recipient[]; selfViewUntil?: number; muted?: boolean; }
export interface EventRow extends StoredOpen { id: string; recipientId: string; country?: string; suspectedBot: boolean; }
/** Storage seam. MemoryStore for dev/tests; Postgres schema lives in migrations/. Raw IPs are never stored. */
export class MemoryStore {
  msgs = new Map<string, Msg>(); recips = new Map<string, Recipient>(); events: EventRow[] = []; optouts = new Set<string>(); salts = new Map<string, string>();
  addMessage(m: Msg) { this.msgs.set(m.id, m); m.recipients.forEach((r) => this.recips.set(r.id, r)); }
  eventsFor(rid: string) { return this.events.filter((e) => e.recipientId === rid); }
  deleteUser(userId: string) {
    for (const m of [...this.msgs.values()].filter((m) => m.userId === userId)) {
      this.msgs.delete(m.id);
      m.recipients.forEach((r) => { this.recips.delete(r.id); this.events = this.events.filter((e) => e.recipientId !== r.id); });
    }
    this.salts.delete(userId);
  }
  purgeOlderThan(ts: number) { this.events = this.events.filter((e) => e.at >= ts); }
}
