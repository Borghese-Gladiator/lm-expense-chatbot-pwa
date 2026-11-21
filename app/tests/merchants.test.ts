import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import type { Db } from "@/server/db";
import { PlaidClient } from "@/server/plaid";
import { applyRules, createRule } from "@/server/rules";

import { addAccount, addTxn, memoryDb } from "./helpers";

let ctx: Ctx;
let db: Db;
let acct: number;

beforeEach(async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  db = await memoryDb();
  ctx = { settings, db, plaid: new PlaidClient(settings) };
  acct = await addAccount(db);
});
afterEach(() => db.close());

async function api(method: string, path: string, body?: unknown) {
  const res = await handle(
    ctx,
    new Request(`http://t/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    path.split("?")[0].split("/"),
  );
  return { status: res.status, data: await res.json() };
}

const merchantOf = async (id: number) => (await db.query<{ merchant: string }>("SELECT merchant FROM transactions WHERE id = ?", [id]))[0].merchant;

describe("merchant list", () => {
  it("counts rows for each name, most rows first, and counts a split part and not its parent", async () => {
    await addTxn(db, acct, "2026-10-01", -5, "AMZN MKTP");
    await addTxn(db, acct, "2026-10-02", -6, "AMZN MKTP");
    await addTxn(db, acct, "2026-10-03", -7, "Amazon.com");
    const parent = await addTxn(db, acct, "2026-10-04", -100, "Store");
    await addTxn(db, acct, "2026-10-04", -60, "Store", null, { parent });
    await addTxn(db, acct, "2026-10-04", -40, "Store", null, { parent });

    const out = (await api("GET", "merchants")).data;
    expect(out).toEqual([
      { merchant: "AMZN MKTP", count: 2 },
      { merchant: "Store", count: 2 },
      { merchant: "Amazon.com", count: 1 },
    ]);
  });
});

describe("rename and merge", () => {
  it("merges three names into one, for past rows, and writes one rule for each name", async () => {
    const ids = [
      await addTxn(db, acct, "2026-10-01", -5, "AMZN MKTP US*2K4"),
      await addTxn(db, acct, "2026-10-02", -6, "AMAZON.COM"),
      await addTxn(db, acct, "2026-10-03", -7, "Amazon Marketplace"),
      await addTxn(db, acct, "2026-10-04", -8, "Target"),
    ];
    const out = await api("POST", "merchants/rename", {
      from: ["AMZN MKTP US*2K4", "AMAZON.COM", "Amazon Marketplace"],
      to: "Amazon",
    });
    expect(out.data).toMatchObject({ rules: 3, changed: 3 });
    expect(await Promise.all(ids.map(merchantOf))).toEqual(["Amazon", "Amazon", "Amazon", "Target"]);
    expect((await db.query("SELECT 1 FROM rules")).length).toBe(3);
  });

  it("keeps the original description", async () => {
    const id = await addTxn(db, acct, "2026-10-01", -5, "AMZN MKTP US*2K4");
    await api("POST", "merchants/rename", { from: ["AMZN MKTP US*2K4"], to: "Amazon" });
    expect((await db.query<{ payee_raw: string }>("SELECT payee_raw FROM transactions WHERE id = ?", [id]))[0].payee_raw).toBe("AMZN MKTP US*2K4");
  });

  it("an exact rule does not match a longer name", async () => {
    const longer = await addTxn(db, acct, "2026-10-01", -5, "Amazon Prime Video");
    const exact = await addTxn(db, acct, "2026-10-02", -5, "Amazon");
    await api("POST", "merchants/rename", { from: ["Amazon"], to: "Amazon.com" });
    expect(await merchantOf(longer)).toBe("Amazon Prime Video");
    expect(await merchantOf(exact)).toBe("Amazon.com");
  });

  it("matches the name in any letter case, so a case fix works", async () => {
    const id = await addTxn(db, acct, "2026-10-01", -5, "amazon");
    await api("POST", "merchants/rename", { from: ["AMAZON"], to: "Amazon" });
    expect(await merchantOf(id)).toBe("Amazon");
  });

  it("skips a row that the user edited", async () => {
    const edited = await addTxn(db, acct, "2026-10-01", -5, "AMZN");
    await db.query("UPDATE transactions SET user_edited = TRUE WHERE id = ?", [edited]);
    const plain = await addTxn(db, acct, "2026-10-02", -5, "AMZN");
    await api("POST", "merchants/rename", { from: ["AMZN"], to: "Amazon" });
    expect([await merchantOf(edited), await merchantOf(plain)]).toEqual(["AMZN", "Amazon"]);
  });

  it("can be undone with the returned execution ids", async () => {
    const id = await addTxn(db, acct, "2026-10-01", -5, "AMZN");
    const out = (await api("POST", "merchants/rename", { from: ["AMZN"], to: "Amazon" })).data;
    expect(await merchantOf(id)).toBe("Amazon");
    for (const exec of out.execution_ids) await api("POST", `rule-executions/${exec}/undo`, {});
    expect(await merchantOf(id)).toBe("AMZN");
  });

  it("applies the new name to rows that arrive later", async () => {
    await api("POST", "merchants/rename", { from: ["AMZN"], to: "Amazon" });
    const later = await addTxn(db, acct, "2026-10-09", -9, "AMZN");
    await applyRules(db, [later]);
    expect(await merchantOf(later)).toBe("Amazon");
  });

  it("ignores a name that is identical to the target, and a repeated name gives one rule", async () => {
    await addTxn(db, acct, "2026-10-01", -5, "Amazon");
    expect((await api("POST", "merchants/rename", { from: ["Amazon"], to: "Amazon" })).data).toMatchObject({ rules: 0, changed: 0 });
    expect((await api("POST", "merchants/rename", { from: ["AMZN", "AMZN"], to: "Amazon" })).data.rules).toBe(1);
    expect((await db.query("SELECT 1 FROM rules")).length).toBe(1);
  });

  it.each([
    [{ from: [], to: "X" }],
    [{ from: ["A"], to: "   " }],
    [{ from: ["   "], to: "X" }],
    [{ to: "X" }],
  ])("rejects %j", async (body) => {
    expect((await api("POST", "merchants/rename", body)).status).toBe(422);
  });
});

describe("equals match on a rule", () => {
  it("contains still matches inside a longer name", async () => {
    const id = await addTxn(db, acct, "2026-10-01", -5, "Amazon Prime Video");
    await createRule(db, { text_contains: "amazon", set_merchant: "Amazon" });
    await applyRules(db, [id]);
    expect(await merchantOf(id)).toBe("Amazon");
  });
});
