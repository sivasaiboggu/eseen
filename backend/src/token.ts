import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
export const newId = () => randomBytes(12).toString("base64url");
/** token = id.sig ; sig = HMAC-SHA256(secret, kind:id) truncated to 16 bytes. Supports rotation: first secret signs, all verify. */
export function sign(kind: "p" | "l", id: string, secrets: string[]): string {
  return `${id}.${mac(kind, id, secrets[0])}`;
}
const mac = (kind: string, id: string, secret: string) => createHmac("sha256", secret).update(`${kind}:${id}`).digest().subarray(0, 16).toString("base64url");
export function verify(kind: "p" | "l", token: string, secrets: string[]): string | null {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const id = token.slice(0, i), sig = Buffer.from(token.slice(i + 1));
  for (const s of secrets) {
    const exp = Buffer.from(mac(kind, id, s));
    if (exp.length === sig.length && timingSafeEqual(exp, sig)) return id;
  }
  return null;
}
