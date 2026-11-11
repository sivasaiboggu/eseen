import { deriveStatus, type Derived, type StoredOpen } from "@eseen/shared";
import { renderBadge, renderCard, type CardEvent } from "../ui/status";
import type { Api } from "./tracking";
/** List badges / thread cards. Associations are exact-thread-ID only (reported by a Gmail-level sent-ack); a fallback-path send has no thread ID and stays unbadged rather than guessed by subject. A thread ID names a conversation, not one email: several tracked sends can share a thread, so rows aggregate ALL of them and each send gets its own card - one send's opens are never shown as another's. */
export interface RecipientView { id: string; label?: string; events: (CardEvent & StoredOpen)[] }
export interface TrackedView { id: string; threadId?: string; sentAt: number; label?: string; mode: "combined" | "per_recipient"; recipients: RecipientView[] }
let cache: { at: number; userId: string; byThread: Map<string, TrackedView[]> } | undefined;
const TTL = 30_000; // freshness floor: debounced observers, no polling storms (spec s13)
export async function trackedByThread(api: Api, now = Date.now()): Promise<Map<string, TrackedView[]>> {
  if (cache && cache.userId === api.userId && now - cache.at < TTL) return cache.byThread; // scoped to the signed-in account: no cross-account badge leakage
  try {
    const r = await (api.fetch ?? fetch)(`${api.base}/v1/messages?limit=100`, { headers: { authorization: `Bearer ${api.userId}` }, cache: "no-store" });
    if (!r.ok) return cache?.userId === api.userId ? cache.byThread : new Map();
    const list = (await r.json()) as TrackedView[];
    const byThread = new Map<string, TrackedView[]>();
    for (const m of list) if (m.threadId) { const a = byThread.get(m.threadId) ?? []; a.push(m); byThread.set(m.threadId, a); }
    for (const a of byThread.values()) a.sort((x, y) => x.sentAt - y.sentAt);
    cache = { at: now, userId: api.userId, byThread };
    return byThread;
  } catch { return cache?.userId === api.userId ? cache.byThread : new Map(); } // stale cache beats no badges
}
/** Row badge: one honest aggregate across every tracked send in the thread (events merged; wording per event stays honest). */
export function threadStatus(msgs: TrackedView[]): Derived {
  return deriveStatus(msgs.flatMap((m) => m.recipients.flatMap((r) => r.events)), { sendAcked: msgs.every((m) => m.recipients.length > 0) });
}
const badged = new WeakSet<Element>(), carded = new WeakSet<Element>();
let generation = 0;
export async function decorate(root: ParentNode, api: Api, opts: { showAuto: boolean; now?: number }): Promise<number> {
  const gen = ++generation;
  // Account switch: remove the previous account's decorations IMMEDIATELY, before any fetch -
  // another account's status must never stay visible, and the WeakSet entries go with them so re-decoration works.
  root.querySelectorAll<HTMLElement>("[data-eseen-uid]").forEach((h) => {
    if (h.dataset.eseenUid === api.userId) return;
    const row = h.closest("tr[data-legacy-thread-id]"); if (row) badged.delete(row);
    const thread = h.closest("div[data-thread-id]"); if (thread) carded.delete(thread);
    h.remove();
  });
  const byThread = await trackedByThread(api, opts.now ?? Date.now());
  if (gen !== generation) return 0; // a newer decorate (e.g. account switch) started while we fetched: this result is stale
  if (!byThread.size) return 0;
  let placed = 0;
  root.querySelectorAll<HTMLElement>("tr[data-legacy-thread-id]").forEach((row) => { // UNVERIFIED Gmail row selector, same policy as compose selectors
    if (badged.has(row)) return;
    const msgs = byThread.get(row.getAttribute("data-legacy-thread-id")!);
    if (!msgs?.length) return;
    badged.add(row);
    const anchor = row.querySelector("td.a4W") ?? row; // subject cell when present (unverified), else the row itself
    const b = renderBadge(threadStatus(msgs)); b.dataset.eseenUid = api.userId;
    anchor.appendChild(b); // icon-only badge: never shifts the row layout
    placed++;
  });
  root.querySelectorAll<HTMLElement>("div[data-thread-id]").forEach((thread) => { // UNVERIFIED open-thread selector
    if (carded.has(thread)) return;
    const msgs = byThread.get(thread.getAttribute("data-thread-id")!);
    if (!msgs?.length) return;
    carded.add(thread);
    for (const m of msgs) // sorted oldest-first; prepending puts the newest send's card on top, each with only that send's opens
      for (const r of m.recipients) {
        const c = renderCard(deriveStatus(r.events, { sendAcked: true }), r.events, { combined: m.mode === "combined", now: opts.now, showAuto: opts.showAuto, sentAt: m.sentAt, subject: m.label }); // per-send identification: sent time (+ subject when the user opted to store it)
        c.dataset.eseenUid = api.userId;
        thread.prepend(c);
        placed++;
      }
  });
  return placed;
}
