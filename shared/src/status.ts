import type { Classification } from "./classify";
export type Status = "SENT" | "NOT_OPENED_YET" | "POSSIBLY_OPENED" | "OPENED";
export interface StoredOpen { at: number; classification: Classification; reason: string; uaFamily?: string; }
export interface Derived { status: Status; label: string; tooltip: string; firstOpenedAt?: number; lastOpenedAt?: number; openCount: number; autoLoadedCount: number; }
/** Wording is fixed by the product spec: never "read", never certain. */
export function deriveStatus(events: StoredOpen[], opts: { sentRecently?: boolean } = {}): Derived {
  const real = events.filter((e) => e.classification === "REAL_OPEN").sort((a, b) => a.at - b.at);
  const auto = events.filter((e) => e.classification === "POSSIBLY_OPENED");
  const base = { openCount: real.length, autoLoadedCount: auto.length };
  if (real.length) return { ...base, status: "OPENED", label: "Opened", firstOpenedAt: real[0].at, lastOpenedAt: real[real.length - 1].at,
    tooltip: "The tracking image loaded and no automation signal was found. This is not proof the email was read." };
  if (auto.length) return { ...base, status: "POSSIBLY_OPENED", label: "Possibly opened (auto-loaded)", tooltip: auto[0].reason };
  return opts.sentRecently ? { ...base, status: "SENT", label: "Sent", tooltip: "Sent. No events yet." }
    : { ...base, status: "NOT_OPENED_YET", label: "No open detected", tooltip: "No open detected. Blocked images can cause misses." };
}
