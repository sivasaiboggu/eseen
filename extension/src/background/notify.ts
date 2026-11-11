import type { Api } from "../content/tracking";
export interface NotifyPrefs { notifications: boolean; notifyFirstOpen: boolean; showAuto: boolean }
export type Seen = Record<string, number>;
export interface RowView { id: string; label?: string; recipients?: { id: string; status?: string; openCount?: number; label?: string }[] }
/** Diffs the message list against what was already surfaced. Only REAL opens (openCount) ever notify; auto-loaded events stay silent. */
export async function checkOnce(api: Api, prefs: NotifyPrefs, seen: Seen, notify: (title: string, body: string) => void): Promise<Seen> {
  if (!prefs.notifications) return seen;
  try {
    const r = await (api.fetch ?? fetch)(`${api.base}/v1/messages?limit=25&showAuto=${prefs.showAuto}`, { headers: { authorization: `Bearer ${api.userId}` } });
    if (!r.ok) return seen;
    const rows = (await r.json()) as RowView[]; if (!Array.isArray(rows)) return seen;
    const next = { ...seen };
    for (const m of rows) for (const rec of m.recipients ?? []) {
      const prev = seen[rec.id] ?? 0, opens = rec.openCount ?? 0;
      if (opens > prev && (prefs.notifyFirstOpen ? prev === 0 : true)) notify(m.label ? `Opened: ${m.label}` : "Tracked email opened", `${opens} ${opens === 1 ? "open" : "opens"}${rec.label ? ` · ${rec.label}` : ""}`);
      next[rec.id] = Math.max(prev, opens);
    }
    return next;
  } catch { return seen; } // offline: keep state, retry next tick
}
