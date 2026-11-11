import { deriveStatus, type Derived, type StoredOpen } from "@eseen/shared";
import { renderBadge, renderCard, type CardEvent } from "../ui/status";
import type { Api } from "./tracking";
/** List badges / thread cards. Badges attach ONLY by exact Gmail thread ID reported by a Gmail-level signal (InboxSDK sent event); a fallback-path send has no thread ID and stays unbadged rather than guessed by subject. */
export interface RecipientView { id: string; label?: string; events: CardEvent[] }
export interface TrackedView { id: string; threadId?: string; mode: "combined" | "per_recipient"; recipients: (RecipientView & { events: (CardEvent & StoredOpen)[] })[] }
let cache: { at: number; byThread: Map<string, TrackedView> } | undefined;
const TTL = 30_000; // freshness floor: debounced observers, no polling storms (spec s13)
export async function trackedByThread(api: Api, now = Date.now()): Promise<Map<string, TrackedView>> {
  if (cache && now - cache.at < TTL) return cache.byThread;
  try {
    const r = await (api.fetch ?? fetch)(`${api.base}/v1/messages?limit=100&showAuto=true`, { headers: { authorization: `Bearer ${api.userId}` }, cache: "no-store" });
    if (!r.ok) return cache?.byThread ?? new Map();
    const list = (await r.json()) as TrackedView[];
    const byThread = new Map<string, TrackedView>();
    for (const m of list) if (m.threadId) byThread.set(m.threadId, m);
    cache = { at: now, byThread };
    return byThread;
  } catch { return cache?.byThread ?? new Map(); } // stale cache beats no badges
}
/** One derived status for the whole message: all recipients' events merged (combined mode has exactly one). */
export function messageStatus(m: TrackedView, sendAcked: boolean): Derived {
  return deriveStatus(m.recipients.flatMap((r) => r.events), { sendAcked });
}
const badged = new WeakSet<Element>(), carded = new WeakSet<Element>();
export async function decorate(root: ParentNode, api: Api, opts: { showAuto: boolean; now?: number }): Promise<number> {
  const byThread = await trackedByThread(api, opts.now ?? Date.now());
  if (!byThread.size) return 0;
  let placed = 0;
  root.querySelectorAll<HTMLElement>("tr[data-legacy-thread-id]").forEach((row) => { // UNVERIFIED Gmail row selector, same policy as compose selectors
    if (badged.has(row)) return;
    const m = byThread.get(row.getAttribute("data-legacy-thread-id")!);
    if (!m) return;
    badged.add(row);
    const anchor = row.querySelector("td.a4W") ?? row; // subject cell when present (unverified), else the row itself
    anchor.appendChild(renderBadge(messageStatus(m, true))); // icon-only badge: never shifts the row layout
    placed++;
  });
  root.querySelectorAll<HTMLElement>("div[data-thread-id]").forEach((thread) => { // UNVERIFIED open-thread selector
    if (carded.has(thread)) return;
    const m = byThread.get(thread.getAttribute("data-thread-id")!);
    if (!m) return;
    carded.add(thread);
    m.recipients.forEach((r) => {
      const d = deriveStatus(r.events, { sendAcked: true });
      thread.prepend(renderCard(d, r.events, { combined: m.mode === "combined", now: opts.now, showAuto: opts.showAuto }));
      placed++;
    });
  });
  return placed;
}
