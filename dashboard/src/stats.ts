import type { StoredOpen } from "@eseen/shared";
export interface Row { id: string; label?: string; sentAt: number; threadId?: string; recipients: { id: string; label?: string; recipientLabel?: string; status: string; openCount: number; autoLoadedCount: number; firstOpenedAt?: number; events: (StoredOpen & { uaFamily?: string })[] }[] }
export interface Summary { tracked: number; eligible: number; opened: number; openRate?: number; avgFirstOpenMs?: number }
// Open-rate denominator: recipients whose send was confirmed (or with observed events).
// REGISTERED means the send was never confirmed, so it is neither an open nor a miss - exclude it
// and report openRate undefined when nothing eligible exists.
export function summarize(rows: Row[]): Summary {
  const per = rows.flatMap((m) => m.recipients);
  const eligible = per.filter((r) => r.status !== "REGISTERED");
  const opened = eligible.filter((r) => r.openCount > 0).length;
  const firsts = rows.flatMap((m) => m.recipients.filter((r) => r.firstOpenedAt !== undefined).map((r) => r.firstOpenedAt! - m.sentAt));
  return { tracked: rows.length, eligible: eligible.length, opened, openRate: eligible.length ? opened / eligible.length : undefined, avgFirstOpenMs: firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : undefined };
}
export function toCsv(rows: Row[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = "recipient,subject,sent,status,opens,auto-loaded,first-opened";
  const lines = rows.flatMap((m) => m.recipients.map((r) => [esc(r.label ?? ""), esc(m.label ?? ""), new Date(m.sentAt).toISOString(), r.status, String(r.openCount), String(r.autoLoadedCount), r.firstOpenedAt ? new Date(r.firstOpenedAt).toISOString() : ""].join(",")));
  return [head, ...lines].join("\n");
}
