import { describe, it, expect } from "vitest";
import { injectPixel, removePixel, readRecipients, chooseMode } from "../src/content/inject";
const mk = (h: string) => { const d = document.createElement("div"); d.innerHTML = h; return d; };
describe("inject", () => {
  it("adds one hidden pixel, keeps visible text", () => {
    const b = mk("<p>Hello</p>"); expect(injectPixel(b, "https://track.eseen.app/p/x.gif")).toBe(true); expect(injectPixel(b, "https://track.eseen.app/p/x.gif")).toBe(false);
    expect(b.textContent).toBe("Hello"); expect(b.querySelector("img")!.getAttribute("style")).toBe("display:none");
  });
  it("refuses non-https pixel urls", () => { expect(injectPixel(mk(""), "javascript:alert(1)")).toBe(false); expect(injectPixel(mk(""), "http://evil.com/x.gif")).toBe(false); });
  it("removes pixel so none are orphaned", () => { const b = mk("<p>x</p>"); injectPixel(b, "https://t/p/a.gif"); expect(removePixel(b)).toBe(1); expect(b.querySelector("img")).toBeNull(); });
  it("reads recipients from header inputs only", () => {
    const r = mk('<input name="to" value="a@x.com"><input name="cc" value="b@x.com"><input name="bcc" value="">'); expect(readRecipients(r)).toEqual([{ email: "a@x.com", kind: "to" }, { email: "b@x.com", kind: "cc" }]);
  });
  it("never splits: always combined", () => { expect(chooseMode()).toBe("combined"); });
});
