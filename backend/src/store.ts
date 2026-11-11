import type { TrackEvent } from "@eseen/shared";
export interface Recipient { id: string; messageId: string; kind: "to" | "cc" | "bcc" | "single"; }
export interface Msg { id: string; userId: string; label?: string; sentAt: number; recipients: Recipient[]; links: { id: string; url: string; messageId: string; recipientId: string }[]; }
export interface StoredEvent extends TrackEvent { id: string; recipientId: string; suspectedBot: boolean; botLabel: string | null; }
/** Storage seam. MemoryStore is for dev/tests; a Postgres impl follows migrations/001_init.sql. Raw IPs are never stored. */
export class MemoryStore {
  msgs = new Map<string, Msg>(); recips = new Map<string, Recipient>(); links = new Map<string, Msg["links"][number]>();
  events: StoredEvent[] = []; optouts = new Set<string>();
  addMessage(m: Msg) { this.msgs.set(m.id, m); m.recipients.forEach((r) => this.recips.set(r.id, r)); m.links.forEach((l) => this.links.set(l.id, l)); }
  deleteUser(userId: string) {
    for (const m of [...this.msgs.values()].filter((m) => m.userId === userId)) {
      this.msgs.delete(m.id);
      m.recipients.forEach((r) => { this.recips.delete(r.id); this.events = this.events.filter((e) => e.recipientId !== r.id); });
      m.links.forEach((l) => this.links.delete(l.id));
    }
  }
}
