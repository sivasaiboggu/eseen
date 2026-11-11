import { createPublicKey, verify as cryptoVerify } from "node:crypto";
/** Verified Google identity: RS256 ID-token signature checked against Google's JWKS, plus iss/aud/exp. The OAuth client ID is configured by the project owner (ESEEN_GOOGLE_CLIENT_ID); this module performs no account creation. Returns a namespaced user id ("g:<sub>") or null. */
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
const b64buf = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export interface GoogleAuthOpts { clientId: string; fetchJwks?: () => Promise<{ keys: unknown[] }>; now?: () => number }
const defaultFetch = async () => (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json();
export function googleAuth(o: GoogleAuthOpts): (idToken: string) => Promise<string | null> {
  let cache: { at: number; keys: Map<string, JsonWebKey> } | undefined;
  const now = o.now ?? Date.now;
  const keys = async () => {
    if (cache && now() - cache.at < 3600_000) return cache.keys;
    const j = await (o.fetchJwks ?? defaultFetch)();
    const m = new Map<string, JsonWebKey>();
    for (const k of (j.keys ?? []) as JsonWebKey[]) if (k.kid && k.n && k.e) m.set(k.kid!, k);
    cache = { at: now(), keys: m };
    return m;
  };
  return async (idToken) => {
    try {
      const [h, p, s] = idToken.split("."); if (!h || !p || !s) return null;
      const header = JSON.parse(b64(h)), payload = JSON.parse(b64(p));
      if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
      const jwk = (await keys()).get(header.kid); if (!jwk) return null;
      const ok = cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), b64buf(s));
      if (!ok) return null;
      if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) return null;
      if (payload.aud !== o.clientId) return null;
      if (typeof payload.exp !== "number" || payload.exp < Math.floor(now() / 1000)) return null;
      return typeof payload.sub === "string" && payload.sub ? `g:${payload.sub}` : null;
    } catch { return null; }
  };
}
