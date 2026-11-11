import type { Api } from "./tracking";
/** Offline queue for best-effort signals (self-view, sent-ack). A dropped signal must not silently corrupt state - a confirmed send left "unconfirmed" is a visible lie, so it retries on the next tick. Registrations are NOT queued: an email sent without its pixel can never be tracked, and pretending otherwise would be another lie. */
export interface QueuedCall { path: string }
const KEY = "eseenSignalQueue";
const store = () => chrome.storage.local;
export async function enqueue(call: QueuedCall): Promise<void> {
  try { const q = ((await store().get(KEY))[KEY] ?? []) as QueuedCall[]; q.push(call); await store().set({ [KEY]: q.slice(-50) }); } catch { /* nothing more to do */ }
}
export async function flushQueue(api: Api): Promise<number> {
  const q = ((await store().get(KEY))[KEY] ?? []) as QueuedCall[];
  if (!q.length) return 0;
  const failed: QueuedCall[] = [];
  for (const c of q) { try { const r = await (api.fetch ?? fetch)(`${api.base}${c.path}`, { method: "POST", headers: { authorization: `Bearer ${api.userId}` } }); if (!r.ok) failed.push(c); } catch { failed.push(c); } }
  try { await store().set({ [KEY]: failed }); } catch { /* keep in memory only */ }
  return q.length - failed.length;
}
/** Fire-and-forget POST with offline retry. */
export async function postSignal(api: Api, path: string): Promise<void> {
  try { const r = await (api.fetch ?? fetch)(`${api.base}${path}`, { method: "POST", headers: { authorization: `Bearer ${api.userId}` } }); if (!r.ok) await enqueue({ path }); }
  catch { await enqueue({ path }); }
}
