import { injectPixel, removePixel } from "./inject";
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
/** Shared by the InboxSDK and fallback paths. Returns "tracked", "untracked" (user agreed) or "cancel". */
export async function prepareSend(body: HTMLElement, api: Api, recipients: string[], confirmUntracked: () => boolean, subjectLabel?: string): Promise<"tracked" | "untracked" | "cancel"> {
  const c = await createTracking(api, recipients, subjectLabel);
  if (c && injectPixel(body, c.pixelUrl)) return "tracked";
  removePixel(body);
  return confirmUntracked() ? "untracked" : "cancel"; // never silently drop or silently send untracked
}
