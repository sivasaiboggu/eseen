import defaultRules from "./rules.json" with { type: "json" };
export type Rules = typeof defaultRules;
export type Classification = "REAL_OPEN" | "POSSIBLY_OPENED" | "SELF_OPEN";
export interface OpenEvent { at: number; userAgent?: string; selfMarker?: boolean; }
export interface Ctx {
  sentAt: number;
  /** Earlier events for the same recipient, oldest first (any classification). */
  prior: { at: number }[];
  /** Set only by an IP-range matcher using ranges from rules.ipRanges. Raw IPs are never passed in. */
  ip?: { apple?: boolean; scanner?: boolean; datacenter?: boolean };
  /** Sender was seen viewing their own sent thread until this time (extension signal). Heuristic. */
  selfViewUntil?: number;
}
export interface Result { classification: Classification; reason: string; }
const has = (ua: string, list: string[]) => list.some((s) => ua.includes(s));

/** Pure. Order follows the spec. A fetch can never be proven human: REAL_OPEN means "no automation signal found". */
export function classify(ev: OpenEvent, ctx: Ctx, r: Rules = defaultRules): Result {
  const ua = (ev.userAgent ?? "").toLowerCase();
  if (ev.selfMarker) return { classification: "SELF_OPEN", reason: "Carried the sender's Eseen marker" };
  if (ctx.selfViewUntil && ev.at <= ctx.selfViewUntil && ctx.prior.length === 0)
    return { classification: "POSSIBLY_OPENED", reason: "First load right after you viewed your own sent email. Could be you, could be the recipient (unverified timing guess, kept visible)" };
  if (ctx.ip?.apple || has(ua, r.appleProxyUa)) return { classification: "POSSIBLY_OPENED", reason: "Auto-loaded by Apple Mail Privacy Protection" };
  if (ctx.ip?.scanner || has(ua, r.scannerUa)) return { classification: "POSSIBLY_OPENED", reason: "Auto-loaded by a security scanner" };
  if (has(ua, r.gmailProxyUa)) {
    const firstFetch = ctx.prior.length === 0;
    if (firstFetch && (ev.at - ctx.sentAt) / 1000 <= r.gmailPrefetchWithinSeconds)
      return { classification: "POSSIBLY_OPENED", reason: "Gmail image proxy loaded this within 60s of sending (likely pre-fetch)" };
    return { classification: "REAL_OPEN", reason: "Via Gmail image proxy. Timing alone cannot prove a person opened it; Gmail also caches images, so repeat opens may be hidden" };
  }
  if (ctx.ip?.datacenter) {
    const burst = ctx.prior.filter((p) => ev.at - p.at <= r.burstWindowSeconds * 1000).length + 1 >= r.burstMinLoads;
    if (burst) return { classification: "POSSIBLY_OPENED", reason: "Burst of loads from a data-center address" };
  }
  return { classification: "REAL_OPEN", reason: "No automation signal found" };
}
