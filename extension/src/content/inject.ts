export const PIXEL_ATTR = "data-eseen";
/** Adds the invisible pixel once. Never touches visible text. Idempotent. */
export function injectPixel(body: HTMLElement, pixelUrl: string): boolean {
  if (!/^https:\/\//.test(pixelUrl) && !/^http:\/\/localhost/.test(pixelUrl)) return false; // sanitize: only our https endpoint (localhost for dev)
  if (body.querySelector(`img[${PIXEL_ATTR}]`)) return false;
  const img = body.ownerDocument.createElement("img");
  img.setAttribute(PIXEL_ATTR, "1"); img.src = pixelUrl; img.width = 1; img.height = 1; img.alt = ""; img.setAttribute("style", "display:none");
  body.appendChild(img);
  return true;
}
/** Removes our pixel (toggle OFF, discard, or failed create). Never leaves orphans. */
export function removePixel(body: HTMLElement): number { const l = body.querySelectorAll(`img[${PIXEL_ATTR}]`); l.forEach((n) => n.remove()); return l.length; }
export interface Recipient { email: string; kind: "to" | "cc" | "bcc" }
/** Reads only recipient addresses from the compose header fields, never body or inbox content. */
export function readRecipients(root: ParentNode): Recipient[] {
  const out: Recipient[] = [];
  (["to", "cc", "bcc"] as const).forEach((k) => root.querySelectorAll<HTMLInputElement>(`input[name="${k}"]`).forEach((i) => { if (i.value && i.value.includes("@")) out.push({ email: i.value, kind: k }); }));
  return out;
}
/** Combined by default. Per-recipient copies are never made unless the user opts in. */
export function chooseMode(userOptedIntoPerRecipient: boolean): "combined" | "per_recipient" { return userOptedIntoPerRecipient ? "per_recipient" : "combined"; }
