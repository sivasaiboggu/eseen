import { injectPixel, removePixel } from "./inject";
import { postSignal } from "./queue";
export interface Api { base: string; userId: string; fetch?: typeof fetch }
export interface Created { id: string; pixelUrl: string }
export async function createTracking(api: Api, recipients: string[], subjectLabel?: string): Promise<Created | null> {
  try {
    const r = await (api.fetch ?? fetch)(`${api.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${api.userId}` },
      body: JSON.stringify({ mode: "combined", recipients: recipients.map((email) => ({ email })), subjectLabel }) });
    if (!r.ok) return null;
    const m = await r.json(); const url = m?.pixels?.[0]?.url;
    return typeof url === "string" ? { id: m.id, pixelUrl: url } : null;
  } catch { return null; }
}
/** Marks the sender's self-view window. MUST be awaited before the pixel exists in the DOM: a compose-side load fires on injection, and a window set afterwards races it. Failure only downgrades the hint, never blocks a send. */
export async function markSelfView(api: Api, id: string): Promise<void> {
  await postSignal(api, `/v1/messages/${id}/self-view`); // queued for retry on failure
}
/** Confirms a send after a Gmail-level success signal (InboxSDK sent event). Never called for the fallback path: a resumed click cannot prove the send happened. */
export async function markSentAck(api: Api, id: string): Promise<void> {
  await postSignal(api, `/v1/messages/${id}/sent-ack`); // queued for retry on failure: a confirmed send must not stay "unconfirmed"
}
/** Shared by the InboxSDK and fallback paths. Returns "tracked", "untracked" (user agreed) or "cancel". onTracked receives the message id so callers can confirm the send later. */
export async function prepareSend(body: HTMLElement, api: Api, recipients: string[], confirmUntracked: () => boolean, subjectLabel?: string, onTracked?: (id: string) => void): Promise<"tracked" | "untracked" | "cancel"> {
  const c = await createTracking(api, recipients, subjectLabel);
  if (c) await markSelfView(api, c.id); // ordered: window opens before the pixel can load anywhere
  if (c && injectPixel(body, c.pixelUrl)) { onTracked?.(c.id); return "tracked"; }
  removePixel(body);
  return confirmUntracked() ? "untracked" : "cancel"; // never silently drop or silently send untracked
}
