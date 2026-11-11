import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { PgStore } from "../src/pgstore.js";
const setup = async () => { const { Pool } = newDb().adapters.createPg(); return PgStore.connect(new Pool()); };
const msg = (id: string, userId = "u1", sentAt = 1000) => ({ id, userId, sentAt, mode: "combined" as const, recipients: [{ id: id + "-r", messageId: id, emailHash: "h" }] });
describe("PgStore (pg-mem, real SQL)", () => {
  it("round-trips messages, recipients and salts", async () => {
    const s = await setup();
    const salt = await s.getSalt("u1"); expect(salt.length).toBe(32); expect(await s.getSalt("u1")).toBe(salt); // stable
    await s.addMessage(msg("m1")); await s.addMessage(msg("m2", "u1", 2000));
    const list = await s.listMessages("u1", 10);
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]); // newest first
    expect((await s.getRecipient("m1-r"))?.emailHash).toBe("h");
  });
  it("dedupes opIds and first ack wins", async () => {
    const s = await setup();
    await s.setOp("u1:op1", { id: "m1" }); expect(await s.getOp("u1:op1")).toEqual({ id: "m1" });
    await s.addMessage(msg("m1"));
    await s.ackSent("m1", 5000, "t-1"); await s.ackSent("m1", 9000, "t-2");
    const m = (await s.getMessage("m1"))!;
    expect(m.sentAckedAt).toBe(5000); expect(m.threadId).toBe("t-1");
    await s.setSelfViewUntil("m1", 7000); expect((await s.getMessage("m1"))!.selfViewUntil).toBe(7000);
  });
  it("logs events, honors optouts, cascades deleteUser, purges", async () => {
    const s = await setup();
    await s.addMessage(msg("m1"));
    await s.addEvent({ id: "e1", recipientId: "m1-r", at: 1000, classification: "REAL_OPEN", reason: "r", suspectedBot: false });
    await s.addEvent({ id: "e2", recipientId: "m1-r", at: 2000, classification: "POSSIBLY_OPENED", reason: "r2", suspectedBot: true });
    expect((await s.eventsFor("m1-r")).length).toBe(2);
    await s.optOut("m1-r"); expect(await s.isOptedOut("m1-r")).toBe(true);
    await s.purgeOlderThan(1500); expect((await s.eventsFor("m1-r")).length).toBe(1);
    await s.deleteUser("u1");
    expect(await s.getMessage("m1")).toBeUndefined(); expect((await s.eventsFor("m1-r")).length).toBe(0);
  });
});
