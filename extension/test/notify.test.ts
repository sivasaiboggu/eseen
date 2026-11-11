import { describe, it, expect } from "vitest";
import { checkOnce, type Seen } from "../src/background/notify";
const rows = [{ id: "m1", label: "Hi", recipients: [{ id: "r1", openCount: 1, label: "All recipients (combined)" }] }];
const api = (body: unknown, ok = true) => ({ base: "x", userId: "u", fetch: (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch });
const prefs = { notifications: true, notifyFirstOpen: false, showAuto: true };
describe("checkOnce", () => {
  it("notifies on new real opens and remembers state", async () => { const out: string[] = []; const seen = await checkOnce(api(rows), prefs, {}, (t) => out.push(t)); expect(out).toEqual(["Opened: Hi"]); expect(seen.r1).toBe(1); });
  it("stays silent when notifications are off or nothing changed", async () => { const out: string[] = []; const seen: Seen = { r1: 1 }; await checkOnce(api(rows), prefs, seen, (t) => out.push(t)); await checkOnce(api(rows), { ...prefs, notifications: false }, {}, (t) => out.push(t)); expect(out).toEqual([]); });
  it("notifyFirstOpen suppresses later opens", async () => { const out: string[] = []; const later = [{ id: "m1", label: "Hi", recipients: [{ id: "r1", openCount: 2, label: "x" }] }]; await checkOnce(api(later), { ...prefs, notifyFirstOpen: true }, { r1: 1 }, (t) => out.push(t)); expect(out).toEqual([]); });
  it("offline keeps prior state", async () => { const seen: Seen = { r1: 1 }; expect(await checkOnce(api({}, false), prefs, seen, () => {})).toEqual(seen); });
});
