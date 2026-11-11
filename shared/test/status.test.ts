import { describe, it, expect } from "vitest";
import { evaluate, classify } from "../src/index";
const T = 1_700_000_000_000;
describe("classify", () => {
  it("flags gmail proxy within 10s", () => expect(classify({ kind: "open", at: T + 4000, userAgent: "Mozilla GoogleImageProxy" }, T)).toBe("gmail_proxy"));
  it("later gmail proxy fetch is not flagged", () => expect(classify({ kind: "open", at: T + 600000, userAgent: "GoogleImageProxy" }, T)).toBeNull());
  it("flags apple fast fetch", () => expect(classify({ kind: "open", at: T + 2000, userAgent: "AppleMail" }, T)).toBe("apple_mpp"));
  it("flags scanners", () => expect(classify({ kind: "click", at: T + 60000, userAgent: "Mimecast" }, T)).toBe("scanner"));
  it("flags instant clicks", () => expect(classify({ kind: "click", at: T + 1000, userAgent: "x" }, T)).toBe("scanner"));
});
describe("evaluate", () => {
  it("SENT with no events", () => expect(evaluate([], T).status).toBe("SENT"));
  it("prefetch only is UNCERTAIN", () => expect(evaluate([{ kind: "open", at: T + 3000, userAgent: "GoogleImageProxy" }], T).status).toBe("UNCERTAIN_PREFETCHED"));
  it("single real open is OPENED", () => expect(evaluate([{ kind: "open", at: T + 60000, userAgent: "Chrome" }], T).status).toBe("OPENED"));
  it("two spaced opens are LIKELY_READ", () => expect(evaluate([{ kind: "open", at: T + 60000 }, { kind: "open", at: T + 120000 }], T).status).toBe("LIKELY_READ"));
  it("dwell >= 8s is LIKELY_READ", () => expect(evaluate([{ kind: "open", at: T + 60000, dwellMs: 9000 }], T).status).toBe("LIKELY_READ"));
  it("real click is CLICKED", () => expect(evaluate([{ kind: "open", at: T + 60000 }, { kind: "click", at: T + 90000 }], T).status).toBe("CLICKED"));
  it("self opens ignored", () => expect(evaluate([{ kind: "open", at: T + 60000, selfOpen: true }], T).status).toBe("SENT"));
  it("never claims delivery", () => expect(evaluate([], T).reason).toMatch(/not confirmed/));
});
