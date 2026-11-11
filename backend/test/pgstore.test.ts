import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { PgStore, makeCipher } from "../src/pgstore.js";
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

describe("PgStore at-rest encryption", () => {
  const k1 = Buffer.alloc(32, 7), k2 = Buffer.alloc(32, 9);
  it("AES-256-GCM round-trips and rejects wrong keys and tampering", () => {
    const c1 = makeCipher(k1);
    const blob = c1.enc("Q3 proposal");
    expect(blob.toString()).not.toContain("Q3 proposal");
    expect(makeCipher(k1).dec(blob)).toBe("Q3 proposal"); // fresh instance: no hidden state
    expect(() => makeCipher(k2).dec(blob)).toThrow(); // wrong key fails the auth tag
    const tampered = Buffer.from(blob); tampered[20] ^= 1;
    expect(() => makeCipher(k1).dec(tampered)).toThrow();
  });
  it("stores opt-in subjects/labels encrypted, never as plaintext", async () => {
    const { Pool } = newDb().adapters.createPg(); const pool = new Pool();
    const store = await PgStore.connect(pool, { dataKey: k1 });
    await store.addMessage({ id: "m1", userId: "u", subjectEnc: "Q3 proposal", sentAt: 1, mode: "per_recipient", recipients: [{ id: "r1", messageId: "m1", emailHash: "h", label: "Priya" }] });
    const raw = await pool.query("select subject_encrypted from messages where id = 'm1'");
    expect(Buffer.from(raw.rows[0].subject_encrypted).toString("latin1")).not.toContain("Q3 proposal");
    const rawR = await pool.query("select display_label_encrypted from recipients where id = 'r1'");
    expect(Buffer.from(rawR.rows[0].display_label_encrypted).toString("latin1")).not.toContain("Priya");
  });
});

describe("PgStore key enforcement (fail closed)", () => {
  it("refuses to start in production mode without a valid 32-byte key", async () => {
    const { Pool } = newDb().adapters.createPg();
    await expect(PgStore.connect(new Pool(), { requireKey: true })).rejects.toThrow(/ESEEN_DATA_KEY/);
    await expect(PgStore.connect(new Pool(), { requireKey: true, dataKey: Buffer.alloc(16) })).rejects.toThrow(/ESEEN_DATA_KEY/);
  });
  it("refuses to store opt-in subjects/labels without a key - never silently plaintext", async () => {
    const { Pool } = newDb().adapters.createPg();
    const store = await PgStore.connect(new Pool()); // no key: fine for data without opt-in labels
    await store.addMessage({ id: "ok1", userId: "u", sentAt: 1, mode: "combined", recipients: [] });
    await expect(store.addMessage({ id: "bad1", userId: "u", subjectEnc: "secret", sentAt: 1, mode: "combined", recipients: [] })).rejects.toThrow(/no data key/);
    await expect(store.addMessage({ id: "bad2", userId: "u", sentAt: 1, mode: "per_recipient", recipients: [{ id: "r", messageId: "bad2", label: "Priya" }] })).rejects.toThrow(/no data key/);
  });
  it("full store round-trip: encrypt at write, decrypt at read, no plaintext at rest", async () => {
    const { Pool } = newDb().adapters.createPg(); const pool = new Pool();
    const store = await PgStore.connect(pool, { dataKey: Buffer.alloc(32, 7), requireKey: true });
    await store.addMessage({ id: "m1", userId: "u", subjectEnc: "Q3 proposal", sentAt: 1, mode: "per_recipient", recipients: [{ id: "r1", messageId: "m1", emailHash: "h", label: "Priya" }] });
    const raw = (await pool.query("select subject_encrypted from messages where id = 'm1'")).rows[0].subject_encrypted;
    expect(raw).not.toContain("Q3 proposal");
    const back = await store.getMessage("m1");
    expect(back?.subjectEnc).toBe("Q3 proposal"); expect(back?.recipients[0].label).toBe("Priya");
    expect((await store.getRecipient("r1"))?.label).toBe("Priya");
    const listed = await store.listMessages("u", 10);
    expect(listed[0].subjectEnc).toBe("Q3 proposal");
  });
});
