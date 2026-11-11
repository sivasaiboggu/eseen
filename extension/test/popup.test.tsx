import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { App, SettingsPanel, defaultPrefs, titleFor, relativeTime, avatarTone, mapStatus, type Row } from "../src/popup/main";
const base: Row = { id: "one", sentAt: Date.parse("2026-11-11T14:14:00"), mode: "combined", recipients: [{ status: "OPENED", label: "Opened", tooltip: "x", openCount: 1, firstOpenedAt: Date.parse("2026-11-11T14:20:00"), email: "priya@example.com", name: "Priya" }] };
describe("popup UI", () => {
  it("title fallback never emits (no label)", () => {
    expect(titleFor({ ...base, label: "Campaign" })).toBe("Campaign");
    expect(titleFor({ ...base, label: undefined, subject: "Proposal" })).toBe("Proposal");
    expect(titleFor({ ...base, label: undefined, subject: undefined })).toBe("Priya");
    expect(titleFor({ ...base, label: undefined, subject: undefined, recipients: [] })).toBe("Untitled email");
  });
  it("time formatting", () => {
    const now = Date.parse("2026-11-11T14:32:00");
    expect(relativeTime(now - 20_000, now)).toBe("just now");
    expect(relativeTime(now - 12 * 60_000, now)).toBe("12 minutes ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(relativeTime(Date.parse("2026-11-10T16:20:00"), now)).toBe("22 hours ago");
  });
  it("maps backend status into four honest labels", () => { expect(mapStatus("OPENED")).toBe("opened"); expect(mapStatus("POSSIBLY_OPENED")).toBe("possible"); expect(mapStatus("SENT")).toBe("sent"); expect(mapStatus("NOT_OPENED_YET")).toBe("not_opened"); });
  it("avatar tone is deterministic", () => { expect(avatarTone("a@example.com")).toEqual(avatarTone("a@example.com")); });
  it("renders summary, honest pill and no oversized claim", () => { const html = renderToStaticMarkup(<App rows={[base]}/>); expect(html).toContain("Tracked today"); expect(html).toContain("Opened"); expect(html).toContain("Not opened"); expect(html).toContain("does not prove"); expect(html).not.toContain("(no label)"); });
  const combined: Row = { id: "c", sentAt: Date.parse("2026-11-11T14:14:00"), mode: "combined", recipients: [{ status: "OPENED", label: "Opened", tooltip: "x", openCount: 2, firstOpenedAt: Date.parse("2026-11-11T14:20:00") }] };
  it("combined rows show a neutral group avatar, never initials from a status label", () => { const html = renderToStaticMarkup(<App rows={[combined]}/>); expect(html).toContain("All recipients"); expect(html).not.toContain(">OP<"); expect(html).toContain("avatar neutral"); });
  it("footer labels demo data and offers no dashboard link", () => { const html = renderToStaticMarkup(<App rows={[base]}/>); expect(html).toContain("Demo data"); expect(html).not.toContain("dashboard"); });
  it("header never claims a live connection in demo mode", () => { const html = renderToStaticMarkup(<App rows={[base]}/>); expect(html).not.toContain(">Live<"); expect(html).toContain("Demo"); });
  it("unavailable settings are disabled with a visible reason", () => { const html = renderToStaticMarkup(<SettingsPanel prefs={defaultPrefs} onPrefs={() => {}} dataActions={false} onClose={() => {}}/>); expect(html).toContain("Not available yet"); expect(html).toContain("Available when connected"); expect((html.match(/disabled/g) || []).length).toBeGreaterThanOrEqual(3); });
  it("data actions unlock only against the local API", () => { const html = renderToStaticMarkup(<SettingsPanel prefs={defaultPrefs} onPrefs={() => {}} dataActions onClose={() => {}} onDownload={() => {}} onDelete={() => {}}/>); expect(html).not.toContain("Available when connected"); });
});
