import type { Api } from "./tracking";
/**
 * Offline queue (spec s13: IndexedDB, retry, exponential backoff) for best-effort SIGNALS
 * (self-view, sent-ack). A dropped sent-ack leaves a confirmed send showing "unconfirmed"
 * forever, a visible lie, so it retries with bounded backoff.
 * Registrations (POST /v1/messages) are NEVER queued here: the pixel must exist before
 * the send, so a late registration is an orphan tracking nothing. Registration failure
 * retries in-place while the send is held (tracking.ts), then the user chooses.
 */
export interface QueuedSignal { path: string; queuedAt: number; attempts: number; body?: string }
export interface SignalStore {
  entries(): Promise<{ key: unknown; value: QueuedSignal }[]>;
  add(s: QueuedSignal): Promise<void>;
  delete(key: unknown): Promise<void>;
}
const DB = "eseen", STORE = "signals", CAP = 50;
const SELF_VIEW_TTL = 90_000; // a self-view marker older than the 60s window protects nothing
const MAX_AGE = 24 * 3600_000, MAX_ATTEMPTS = 10;
const backoff = (attempts: number) => Math.min(60_000 * 2 ** attempts, 30 * 60_000); // 1m, 2m, 4m ... capped 30m (driven by the 1-min tick)

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
const tx = (db: IDBDatabase, mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
export const idbSignalStore: SignalStore = {
  async entries() { const db = await idb(); return new Promise((res, rej) => { const out: { key: unknown; value: QueuedSignal }[] = []; const c = tx(db, "readonly").openCursor(); c.onsuccess = () => { if (c.result) { out.push({ key: c.result.key, value: c.result.value }); c.result.continue(); } else res(out); }; c.onerror = () => rej(c.error); }); },
  async add(s) { const db = await idb(); await new Promise<void>((res, rej) => { const r = tx(db, "readwrite").add(s); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  async delete(key) { const db = await idb(); await new Promise<void>((res, rej) => { const r = tx(db, "readwrite").delete(key as IDBValidKey); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
};
export async function enqueue(s: QueuedSignal, store: SignalStore = idbSignalStore): Promise<void> {
  try { await store.add(s); const all = await store.entries(); for (const e of all.slice(0, Math.max(0, all.length - CAP))) await store.delete(e.key); } catch { /* nothing more to do */ }
}
/** POST a signal; on network/5xx failure queue it. Returns true only when actually delivered now - callers must not treat a queued signal as registered. */
export async function postSignal(api: Api, path: string, store: SignalStore = idbSignalStore, body?: string): Promise<boolean> {
  try {
    const r = await (api.fetch ?? fetch)(`${api.base}${path}`, { method: "POST", headers: { authorization: `Bearer ${api.userId}`, ...(body ? { "content-type": "application/json" } : {}) }, body });
    if (r.ok) return true;
    if (r.status >= 500) await enqueue({ path, queuedAt: Date.now(), attempts: 0, body }, store);
    return false; // 4xx will not fix itself by retrying
  } catch { await enqueue({ path, queuedAt: Date.now(), attempts: 0, body }, store); return false; }
}
/** Retry queued signals whose backoff has elapsed; drop expired or exhausted ones. Returns deliveries. */
export async function flushQueue(api: Api, store: SignalStore = idbSignalStore, now = Date.now()): Promise<number> {
  let delivered = 0;
  for (const { key, value: s } of await store.entries()) {
    const age = now - s.queuedAt;
    if ((s.path.endsWith("/self-view") && age > SELF_VIEW_TTL) || age > MAX_AGE || s.attempts >= MAX_ATTEMPTS) { await store.delete(key); continue; }
    if (age < backoff(s.attempts)) continue;
    try { const r = await (api.fetch ?? fetch)(`${api.base}${s.path}`, { method: "POST", headers: { authorization: `Bearer ${api.userId}`, ...(s.body ? { "content-type": "application/json" } : {}) }, body: s.body }); if (r.ok) { await store.delete(key); delivered++; continue; } if (r.status < 500) { await store.delete(key); continue; } } catch { /* retry next time */ }
    await store.delete(key); await store.add({ ...s, attempts: s.attempts + 1 });
  }
  return delivered;
}
