import type { StoredOpen } from "@eseen/shared";
export interface Row { id: string; label?: string; sentAt: number; threadId?: string; recipients: { id: string; label?: string; recipientLabel?: string; status: string; openCount: number; autoLoadedCount: number; firstOpenedAt?: number; events: (StoredOpen & { uaFamily?: string })[] }[] }
export interface Summary { tracked: number; opened: number; openRate: number; avgFirstOpenMs?: number }
export function summarize(rows: Row[]): Summary {
  const per = rows.flatMap((m) => m.recipients);
  const opened = per.filter((r) => r.openCount > 0).length;
  const firsts = rows.flatMap((m) => m.recipients.filter((r) => r.firstOpenedAt !== undefined).map((r) => r.firstOpenedAt! - m.sentAt));
  return { tracked: rows.length, opened, openRate: per.length ? opened / per.length : 0, avgFirstOpenMs: firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : undefined };
}
export function toCsv(rows: Row[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = "recipient,subject,sent,status,opens,auto-loaded,first-opened";
  const lines = rows.flatMap((m) => m.recipients.map((r) => [esc(r.label ?? ""), esc(m.label ?? ""), new Date(m.sentAt).toISOString(), r.status, String(r.openCount), String(r.autoLoadedCount), r.firstOpenedAt ? new Date(r.firstOpenedAt).toISOString() : ""].join(",")));
  return [head, ...lines].join("\n");
}
