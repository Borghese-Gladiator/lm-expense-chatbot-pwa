import { afterEach, beforeEach, expect, it } from "vitest";

import { handle, type Ctx } from "@/server/api";
import { loadSettings } from "@/server/config";
import { one, scalar } from "@/server/db";
import { PlaidClient } from "@/server/plaid";

import { addAccount, addTxn, memoryDb } from "./helpers";

let ctx: Ctx;
beforeEach(async () => {
  const settings = loadSettings({} as NodeJS.ProcessEnv);
  ctx = { settings, db: await memoryDb(), plaid: new PlaidClient(settings) };
});
afterEach(() => ctx.db.close());

const call = (method: string, path: string, body?: unknown) =>
  handle(ctx, new Request(`http://test/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), path.split("/"));

it("C1: tables exist and trip_transactions.amount accepts NULL", async () => {
  const cols = await ctx.db.query<{ table_name: string; column_name: string; is_nullable: string }>(
    "SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_name IN ('trips', 'trip_transactions')",
  );
  expect(new Set(cols.map((c) => c.table_name))).toEqual(new Set(["trips", "trip_transactions"]));
  expect(cols.find((c) => c.table_name === "trip_transactions" && c.column_name === "amount")!.is_nullable).toBe("YES");

  const a = await addAccount(ctx.db);
  const t = await addTxn(ctx.db, a, "2026-10-01", -100, "Hotel");
  const trip = await scalar(ctx.db, "INSERT INTO trips (name) VALUES ('X') RETURNING id");
  await ctx.db.query("INSERT INTO trip_transactions (trip_id, transaction_id, amount) VALUES (?, ?, NULL)", [trip, t]);
  expect((await one(ctx.db, "SELECT amount FROM trip_transactions"))!.amount).toBeNull();
});

it("C2: create, list, change, delete a trip; delete keeps the transactions", async () => {
  const created = await call("POST", "trips", { name: "Japan", start_date: "2026-10-01", end_date: "2026-10-10" });
  const id = (await created.json()).id;
  expect(((await (await call("GET", "trips")).json()) as { name: string }[]).map((t) => t.name)).toEqual(["Japan"]);

  expect((await call("PATCH", `trips/${id}`, { name: "Tokyo" })).status).toBe(200);
  const [trip] = await (await call("GET", "trips")).json();
  expect(trip.name).toBe("Tokyo");
  expect(trip.start_date).toBe("2026-10-01");

  const a = await addAccount(ctx.db);
  const t = await addTxn(ctx.db, a, "2026-10-02", -100, "Hotel");
  expect((await call("POST", `trips/${id}/transactions`, { transaction_id: t })).status).toBe(200);
  expect(await scalar(ctx.db, "SELECT COUNT(*) FROM trip_transactions")).toBe(1);

  expect((await call("DELETE", `trips/${id}`)).status).toBe(200);
  expect(await scalar(ctx.db, "SELECT COUNT(*) FROM trips")).toBe(0);
  expect(await scalar(ctx.db, "SELECT COUNT(*) FROM trip_transactions")).toBe(0);
  expect(await scalar(ctx.db, "SELECT COUNT(*) FROM transactions")).toBe(1);
});

it("C3: a link amount above the transaction amount returns 422", async () => {
  const id = (await (await call("POST", "trips", { name: "Trip" })).json()).id;
  const a = await addAccount(ctx.db);
  const t = await addTxn(ctx.db, a, "2026-10-02", -100, "Hotel");
  expect((await call("POST", `trips/${id}/transactions`, { transaction_id: t, amount: 100.01 })).status).toBe(422);
  expect((await call("POST", `trips/${id}/transactions`, { transaction_id: t, amount: 100 })).status).toBe(200);
  expect(await scalar(ctx.db, "SELECT COUNT(*) FROM trip_transactions")).toBe(1);
});
