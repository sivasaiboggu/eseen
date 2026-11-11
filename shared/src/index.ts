import rules from "./rules.json" with { type: "json" };
export { rules };
export type Rules = typeof rules;

export type EventKind = "open" | "click";
export interface TrackEvent {
  kind: EventKind;
  at: number; // epoch ms
  userAgent?: string;
  suspectedBot?: boolean;
  selfOpen?: boolean;
  dwellMs?: number;
}
export type Status = "SENT" | "OPENED" | "LIKELY_READ" | "CLICKED" | "UNCERTAIN_PREFETCHED";
export interface Evaluation { status: Status; confidence: number; reason: string; humanOpens: number; clicks: number; }

export type BotLabel = "gmail_proxy" | "apple_mpp" | "scanner" | null;

/** Classify a single event. Heuristic only: a proxy fetch cannot prove a human opened. */
export function classify(ev: Pick<TrackEvent, "kind" | "at" | "userAgent">, sentAt: number, r: Rules = rules): BotLabel {
  const ua = (ev.userAgent ?? "").toLowerCase();
  const delta = (ev.at - sentAt) / 1000;
  if (r.scannerUaSubstrings.some((s) => ua.includes(s))) return "scanner";
  if (ev.kind === "click" && delta >= 0 && delta <= r.instantClickWithinSeconds) return "scanner";
  if (r.gmailProxyUaSubstrings.some((s) => ua.includes(s)) && delta <= r.gmailPrefetchWithinSeconds) return "gmail_proxy";
  if (r.applePrivacyUaSubstrings.some((s) => ua.includes(s)) && delta <= r.applePrefetchWithinSeconds) return "apple_mpp";
  return null;
}

/** Per-recipient status + confidence. Flagged and self events are kept by callers but ignored here. */
export function evaluate(events: TrackEvent[], sentAt: number, r: Rules = rules): Evaluation {
  const real = events
    .map((e) => ({ e, bot: e.suspectedBot ?? classify(e, sentAt, r) !== null }))
    .filter((x) => !x.bot && !x.e.selfOpen)
    .map((x) => x.e)
    .sort((a, b) => a.at - b.at);
  const opens = real.filter((e) => e.kind === "open");
  const clicks = real.filter((e) => e.kind === "click");
  const flagged = events.filter((e) => !e.selfOpen).length - real.length;

  if (clicks.length) {
    return { status: "CLICKED", confidence: opens.length ? 95 : 85, humanOpens: opens.length, clicks: clicks.length,
      reason: `Clicked a tracked link${opens.length ? ` and opened ${opens.length}x` : ""}. Clicks are the strongest signal, but link scanners can still click.` };
  }
  if (opens.length) {
    const dwell = opens.some((o) => (o.dwellMs ?? 0) >= 8000);
    const spaced = opens.length >= 2 && opens[opens.length - 1].at - opens[0].at > 30000;
    if (dwell || spaced) {
      return { status: "LIKELY_READ", confidence: dwell && spaced ? 90 : 75, humanOpens: opens.length, clicks: 0,
        reason: `${dwell ? "Viewed 8s+" : ""}${dwell && spaced ? " and " : ""}${spaced ? `opened ${opens.length}x more than 30s apart` : ""}. Likely read, not proven.` };
    }
    return { status: "OPENED", confidence: 55, humanOpens: opens.length, clicks: 0,
      reason: "Image loaded once with no read signal. Could still be an automated fetch." };
  }
  if (flagged > 0) {
    return { status: "UNCERTAIN_PREFETCHED", confidence: 20, humanOpens: 0, clicks: 0,
      reason: `${flagged} event(s) look automated (proxy, privacy protection or scanner). No human open established.` };
  }
  return { status: "SENT", confidence: 100, humanOpens: 0, clicks: 0, reason: "Sent. Delivery is not confirmed by tracking." };
}
