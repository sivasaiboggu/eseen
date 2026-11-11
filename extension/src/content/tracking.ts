import { injectPixel, removePixel } from "./inject";
import { postSignal } from "./queue";
export interface Api { base: string; userId: string; fetch?: typeof fetch }
export interface Created { id: string; pixelUrl: string }
/** Creates the registration. Network/5xx failures retry with bounded exponential backoff while the send is HELD (spec s13); if it still cannot be created the caller asks the user - a registration is never queued for after the send, since the pixel must exist in the email. */
export async function createTracking(api: Api, recipients: string[], subjectLabel?: string, opts: { retries?: number; sleep?: (ms: number) => Promise<void>; opId?: string } = {}): Promise<Created | null> {
  const retries = opts.retries ?? 3, sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const opId = opts.opId ?? crypto.randomUUID(); // one key across all retries: a committed-but-lost response replays the same registration instead of orphaning one
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await (api.fetch ?? fetch)(`${api.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${api.userId}` },
        body: JSON.stringify({ mode: "combined", opId, recipients: recipients.map((email) => ({ email })), subjectLabel }) });
      if (r.ok) { const m = await r.json(); const url = m?.pixels?.[0]?.url; return typeof url === "string" ? { id: m.id, pixelUrl: url } : null; }
      if (r.status < 500) return null; // a rejection (bad request, auth) will not fix itself; the user decides
    } catch { /* network down: fall through to backoff */ }
    if (attempt >= retries) return null;
    await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s, 4s
  }
}
/** Marks the sender's self-view window. MUST be awaited before the pixel exists in the DOM: a compose-side load fires on injection, and a window set afterwards races it. Failure only downgrades the hint, never blocks a send. */
export async function markSelfView(api: Api, id: string): Promise<boolean> {
  return postSignal(api, `/v1/messages/${id}/self-view`); // false = NOT armed (queued retries within the window may still land)
}
/** Confirms a send after a Gmail-level success signal (InboxSDK sent event). Never called for the fallback path: a resumed click cannot prove the send happened. */
export async function markSentAck(api: Api, id: string, threadId?: string): Promise<boolean> {
  return postSignal(api, `/v1/messages/${id}/sent-ack`, undefined, threadId ? JSON.stringify({ threadId }) : undefined); // false = queued; a confirmed send must not stay "unconfirmed"
}
/** Shared by the InboxSDK and fallback paths. Returns "tracked", "untracked" (user agreed) or "cancel". onTracked receives the message id so callers can confirm the send later. */
export async function prepareSend(body: HTMLElement, api: Api, recipients: string[], confirmUntracked: () => boolean, subjectLabel?: string, onTracked?: (id: string, selfViewArmed: boolean) => void, opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<"tracked" | "untracked" | "cancel"> {
  const c = await createTracking(api, recipients, subjectLabel, opts);
  // Ordered: the window must open before the pixel can load anywhere. When the marker
  // fails, injection still proceeds (a hint never blocks a send) but selfViewArmed=false:
  // the protection is NOT in place and only the Gmail-proxy timing rule can still
  // downgrade the compose-side load. A queued marker is never treated as registered.
  const armed = c ? await markSelfView(api, c.id) : false;
  if (c && injectPixel(body, c.pixelUrl)) { onTracked?.(c.id, armed); return "tracked"; }
  removePixel(body);
  return confirmUntracked() ? "untracked" : "cancel"; // never silently drop or silently send untracked
}
