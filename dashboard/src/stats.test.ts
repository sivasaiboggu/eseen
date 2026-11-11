import { describe, it, expect } from "vitest";
import { summarize, toCsv, type Row } from "./stats";
const row = (id: string, sentAt: number, openCount: number, firstOpenedAt?: number, label?: string): Row =>
  ({ id, sentAt, label, recipients: [{ id: id + "-r", label, status: openCount ? "OPENED" : "NOT_OPENED_YET", openCount, autoLoadedCount: 0, firstOpenedAt, events: [] }] });
describe("dashboard stats", () => {
  it("summarizes tracked, open rate and average time to first open", () => {
    const s = summarize([row("a", 0, 1, 60000), row("b", 0, 1, 120000), row("c", 0, 0)]);
    expect(s.tracked).toBe(3); expect(s.opened).toBe(2); expect(s.openRate).toBeCloseTo(2 / 3); expect(s.avgFirstOpenMs).toBe(90000);
  });
  it("excludes unconfirmed registrations from the open-rate denominator", () => {
    const reg: Row = { id: "d", sentAt: 0, recipients: [{ id: "d-r", status: "REGISTERED", openCount: 0, autoLoadedCount: 0, events: [] }] };
    const s = summarize([row("a", 0, 1, 60000), reg]);
    expect(s.tracked).toBe(2); expect(s.eligible).toBe(1); expect(s.openRate).toBe(1);
    const only = summarize([reg]);
    expect(only.openRate).toBeUndefined(); expect(only.avgFirstOpenMs).toBeUndefined();
  });
  it("exports CSV with escaping", () => {
    const csv = toCsv([row("a", 0, 1, 60000, 'a "quoted" subject')]);
    expect(csv).toContain('"a ""quoted"" subject"');
    expect(csv.split("\n")).toHaveLength(2);
  });
});
