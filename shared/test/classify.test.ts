import { describe, it, expect } from "vitest";
import { classify, deriveStatus } from "../src/index";
const T = 1_700_000_000_000;
const c = (o: any = {}) => ({ sentAt: T, prior: [], ...o });
describe("classify", () => {
  it("self marker", () => expect(classify({ at: T + 5000, selfMarker: true }, c()).classification).toBe("SELF_OPEN"));
  it("self-view timing guess is POSSIBLY_OPENED, never SELF_OPEN", () => {
    const r = classify({ at: T + 5000 }, c({ selfViewUntil: T + 60000 }));
    expect(r.classification).toBe("POSSIBLY_OPENED"); expect(r.reason).toMatch(/unverified/);
    expect(classify({ at: T + 5000 }, c({ selfViewUntil: T + 60000, prior: [{ at: T + 1 }] })).classification).toBe("REAL_OPEN");
  });
  it("apple by UA and by IP", () => {
    expect(classify({ at: T + 9e5, userAgent: "AppleMail" }, c()).classification).toBe("POSSIBLY_OPENED");
    expect(classify({ at: T + 9e5, userAgent: "x" }, c({ ip: { apple: true } })).reason).toMatch(/Apple/);
  });
  it("gmail proxy first fetch <=60s is prefetch", () => expect(classify({ at: T + 59000, userAgent: "GoogleImageProxy" }, c()).classification).toBe("POSSIBLY_OPENED"));
  it("gmail proxy first fetch after 60s is real", () => expect(classify({ at: T + 61000, userAgent: "GoogleImageProxy" }, c()).classification).toBe("REAL_OPEN"));
  it("gmail proxy later fetch is real and notes caching", () => {
    const r = classify({ at: T + 30000, userAgent: "GoogleImageProxy" }, c({ prior: [{ at: T + 2000 }] }));
    expect(r.classification).toBe("REAL_OPEN"); expect(r.reason).toMatch(/caches/);
  });
  it("scanners", () => ["Proofpoint", "Mimecast", "Barracuda", "Microsoft Defender", "Cisco", "Symantec", "Avanan"].forEach((u) =>
    expect(classify({ at: T + 9e5, userAgent: u }, c()).classification).toBe("POSSIBLY_OPENED")));
  it("burst from datacenter", () => expect(classify({ at: T + 1000, userAgent: "x" }, c({ ip: { datacenter: true }, prior: [{ at: T + 500 }] })).classification).toBe("POSSIBLY_OPENED"));
  it("single datacenter load is not burst", () => expect(classify({ at: T + 61000, userAgent: "x" }, c({ ip: { datacenter: true } })).classification).toBe("REAL_OPEN"));
  it("everything else real", () => expect(classify({ at: T + 9e5, userAgent: "Mozilla Chrome" }, c()).classification).toBe("REAL_OPEN"));
});
describe("deriveStatus", () => {
  const e = (classification: any, at = T) => ({ at, classification, reason: "r" });
  it("any real -> OPENED with counts and times", () => {
    const d = deriveStatus([e("POSSIBLY_OPENED", T), e("REAL_OPEN", T + 5), e("REAL_OPEN", T + 9)]);
    expect(d.status).toBe("OPENED"); expect(d.openCount).toBe(2); expect(d.firstOpenedAt).toBe(T + 5); expect(d.lastOpenedAt).toBe(T + 9);
  });
  it("only auto -> possibly", () => expect(deriveStatus([e("POSSIBLY_OPENED")]).label).toBe("Possibly opened (auto-loaded)"));
  it("none -> sent or no open detected", () => {
    expect(deriveStatus([], { sentRecently: true }).status).toBe("SENT");
    expect(deriveStatus([], { sentRecently: true, sendAcked: false }).status).toBe("REGISTERED");
    expect(deriveStatus([], { sentRecently: false, sendAcked: false }).label).toBe("Set up - send unconfirmed");
    expect(deriveStatus([{ at: 1, classification: "POSSIBLY_OPENED", reason: "x" }], { sendAcked: false }).status).toBe("POSSIBLY_OPENED");
    expect(deriveStatus([]).tooltip).toMatch(/^No open detected/);
  });
  it("self opens are ignored", () => expect(deriveStatus([e("SELF_OPEN")]).status).toBe("NOT_OPENED_YET"));
  it("label never says read", () => expect(deriveStatus([e("REAL_OPEN")]).label).not.toMatch(/read/i));
});

describe("first load inside the send window without a marker", () => {
  it("stays POSSIBLY_OPENED for a direct (non-proxy) first load within 60s - sender's own view is indistinguishable", () => {
    const r = classify({ at: 30_000, userAgent: "Mozilla/5.0 AppleWebKit" }, { sentAt: 0, prior: [] });
    expect(r.classification).toBe("POSSIBLY_OPENED");
    expect(r.reason).toContain("Could be your own mail client");
  });
  it("counts a direct first load after the window as REAL_OPEN", () => {
    const r = classify({ at: 61_000, userAgent: "Mozilla/5.0 AppleWebKit" }, { sentAt: 0, prior: [] });
    expect(r.classification).toBe("REAL_OPEN");
  });
  it("a later direct load with prior events is unaffected", () => {
    const r = classify({ at: 30_000, userAgent: "Mozilla/5.0 AppleWebKit" }, { sentAt: 0, prior: [{ at: 10_000 }] });
    expect(r.classification).toBe("REAL_OPEN");
  });
});
