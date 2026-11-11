import { describe, it, expect } from "vitest";
import { deriveStatus } from "@eseen/shared";
import { renderBadge, renderCard, rel } from "../src/ui/status";
const T = 1_700_000_000_000;
describe("ui", () => {
  it("badge is shadow-rooted, labelled, never says read", () => {
    const el = renderBadge(deriveStatus([{ at: T, classification: "REAL_OPEN", reason: "r" }])); const html = el.shadowRoot!.innerHTML;
    expect(html).toContain('role="img"'); expect(html).toContain("aria-label"); expect(html.replace(/not proof[^"]*/g, "")).not.toMatch(/\bread\b/i);
  });
  it("card shows counts, combined note, toggles auto-loaded opens", () => {
    const d = deriveStatus([{ at: T, classification: "POSSIBLY_OPENED", reason: "Auto-loaded by Apple Mail Privacy Protection" }, { at: T + 600000, classification: "REAL_OPEN", reason: "x" }]);
    const el = renderCard(d, [{ at: T, classification: "POSSIBLY_OPENED", reason: "Auto-loaded by Apple Mail Privacy Protection" }, { at: T + 600000, classification: "REAL_OPEN", reason: "x", uaFamily: "mobile" }], { combined: true, now: T + 1200000 });
    const r = el.shadowRoot!; expect(r.textContent).toContain("All recipients (combined)"); expect(r.textContent).toContain("1 open"); expect(r.textContent).not.toContain("Apple Mail");
    (r.getElementById("t") as HTMLButtonElement).click(); expect(r.textContent).toContain("Apple Mail Privacy Protection");
  });
  it("relative time", () => { expect(rel(T, T + 12 * 60000)).toBe("12 min ago"); });
});
