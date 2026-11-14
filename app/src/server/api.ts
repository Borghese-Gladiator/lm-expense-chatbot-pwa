import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  AnalyticsQuerySchema,
  BadRequest,
  drilldown,
  DrilldownSchema,
  FiltersSchema,
  runQuery,
  whereClause,
} from "./analytics";
import { mockAsk, mockFetch, mockSettings, seedIfEmpty } from "./mock";
import { loadSettings, type Settings } from "./config";
import { CsvImportSchema, importCsv } from "./csv";
import { one, openDb, scalar, type Db, type Row } from "./db";
import * as plaid from "./plaid";

export interface Ctx {
  db: Db;
  settings: Settings;
  plaid: plaid.PlaidClient;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (ctx: Ctx, args: { params: string[]; body: unknown; req: Request }) => Promise<unknown>;

const TxnSearch = z.object({
  filters: FiltersSchema.prefault({ include_pending: true, include_excluded_categories: true }),
  uncategorized: z.boolean().default(false),
  unreviewed: z.boolean().default(false),
  sort: z.enum(["date", "amount", "merchant", "category", "account"]).default("date"),
  desc: z.boolean().default(true),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(100),
});
const TxnType = z.enum(["income", "expense", "transfer", "adjustment"]);
const TxnIn = z.object({
  account_id: z.number().int(),
  date: z.iso.date(),
  amount: z.number(),
  payee: z.string().min(1),
  category_id: z.number().int().nullish(),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullish(),
  type: TxnType.nullish(),
});
const TxnPatch = z.object({
  merchant: z.string().nullish(),
  category_id: z.number().int().nullish(),
  tags: z.array(z.string()).nullish(),
  notes: z.string().nullish(),
  type: TxnType.nullish(),
  reviewed: z.boolean().nullish(),
  clear_category: z.boolean().default(false),
  clear_type: z.boolean().default(false),
});
const BulkPatch = z.object({ ids: z.array(z.number().int()).min(1).max(5000), patch: TxnPatch });
const SavedQueryIn = z.object({ name: z.string().min(1).max(120), query: AnalyticsQuerySchema });
const AccountIn = z.object({
  name: z.string().min(1),
  type: z.string().default("checking"),
  institution: z.string().nullish(),
  currency: z.string().default("USD"),
  balance: z.number().nullish(),
});
const AccountPatch = z.object({
  name: z.string().nullish(),
  archived: z.boolean().nullish(),
  history_cutover: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
const MergeIn = z.object({ into_id: z.number().int() });
const CategoryIn = z.object({
  name: z.string().min(1),
  group_name: z.string().nullish(),
  kind: z.enum(["expense", "income", "transfer"]).default("expense"),
  exclude_from_totals: z.boolean().default(false),
  archived: z.boolean().default(false),
});
const AskRequest = z.object({ question: z.string().min(3).max(500) });
const PublicTokenIn = z.object({ public_token: z.string(), institution: z.string().nullish() });

const id = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new HttpError(404, "not found");
  return n;
};

function txnWhere(body: z.infer<typeof TxnSearch>): [string, unknown[]] {
  let [where, params] = whereClause(body.filters, null);
  if (body.uncategorized) where += " AND category_id IS NULL";
  if (body.unreviewed) where += " AND NOT reviewed";
  return [where, params];
}

async function patchTxns(db: Db, ids: number[], body: z.infer<typeof TxnPatch>) {
  const fields = Object.entries(body).filter(
    ([k, v]) => v !== null && v !== undefined && k !== "clear_category" && k !== "clear_type",
  );
  const sets = fields.map(([k]) => `${k} = ?`);
  const params: unknown[] = fields.map(([, v]) => v);
  if (body.clear_category) sets.push("category_id = NULL");
  if (body.clear_type) sets.push("type = NULL");
  if (!sets.length) return;
  sets.push("user_edited = TRUE", "updated_at = now()");
  await db.query(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ANY(?::bigint[])`, [...params, ids]);
}

function plaidFailure(e: unknown): never {
  if (e instanceof plaid.PlaidError) throw new HttpError(e.code === plaid.SYNC_RUNNING ? 409 : 502, e.message);
  if (e instanceof Error && e.message.startsWith("APP_SECRET_KEY")) throw new HttpError(502, e.message);
  throw e;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function syncAll(ctx: Ctx) {
  const items = await ctx.db.query<{ id: number }>("SELECT id FROM plaid_items WHERE status != 'reconnect' ORDER BY id");
  const results: Row[] = [];
  for (const item of items) {
    try {
      results.push({ item: item.id, ...(await plaid.syncItem(ctx.db, ctx.plaid, item.id)) });
    } catch (e) {
      results.push({ item: item.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { items: results };
}

const ROUTES: [string, string, Handler][] = [
  [
    "GET",
    "health",
    async ({ db }) => ({
      status: "ok",
      transactions: await scalar(db, "SELECT COUNT(*) FROM transactions"),
      last_sync: (await scalar(db, "SELECT MAX(finished_at) FROM sync_runs WHERE status != 'error'")) ?? null,
    }),
  ],
  [
    "GET",
    "meta",
    async ({ db, settings }) => {
      const [categories, accounts, tags, groups, bounds] = await Promise.all([
        db.query("SELECT * FROM categories ORDER BY group_name NULLS LAST, name"),
        db.query(
          `SELECT a.*, (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS txn_count
           FROM accounts a ORDER BY a.name`,
        ),
        db.query<{ t: string }>("SELECT DISTINCT unnest(tags) AS t FROM transactions ORDER BY t"),
        db.query<{ g: string }>("SELECT DISTINCT category_group AS g FROM reportable ORDER BY g"),
        one(db, "SELECT MIN(date) AS start, MAX(date) AS end FROM transactions"),
      ]);
      return {
        currency: settings.currency,
        plaid_configured: Boolean(settings.plaidClientId),
        plaid_env: settings.plaidEnv,
        ask_configured: Boolean(settings.anthropicApiKey),
        categories,
        accounts,
        tags: tags.map((r) => r.t),
        groups: groups.map((r) => r.g),
        date_bounds: bounds,
      };
    },
  ],
  ["POST", "analytics/query", async ({ db }, { body }) => runQuery(db, AnalyticsQuerySchema.parse(body ?? {}))],
  ["POST", "analytics/drilldown", async ({ db }, { body }) => drilldown(db, DrilldownSchema.parse(body))],
  [
    "POST",
    "ask",
    async ({ db, settings }, { body }) => {
      const { question } = AskRequest.parse(body);
      if (!settings.anthropicApiKey) throw new HttpError(503, "set ANTHROPIC_API_KEY to use Ask");
      try {
        return await mockAsk(db, question);
      } catch (e) {
        if (e instanceof Anthropic.APIError || e instanceof Error)
          throw new HttpError(502, `Ask failed: ${e.constructor.name}`);
        throw e;
      }
    },
  ],
  ["GET", "saved-queries", async ({ db }) => db.query("SELECT * FROM saved_queries ORDER BY updated_at DESC")],
  [
    "POST",
    "saved-queries",
    async ({ db }, { body }) => {
      const b = SavedQueryIn.parse(body);
      return {
        id: await scalar(db, "INSERT INTO saved_queries (name, query) VALUES (?, ?) RETURNING id", [
          b.name,
          JSON.stringify(b.query),
        ]),
      };
    },
  ],
  [
    "PUT",
    "saved-queries/:id",
    async ({ db }, { params, body }) => {
      const b = SavedQueryIn.parse(body);
      await db.query("UPDATE saved_queries SET name = ?, query = ?, updated_at = now() WHERE id = ?", [
        b.name,
        JSON.stringify(b.query),
        id(params[0]),
      ]);
      return { id: id(params[0]) };
    },
  ],
  [
    "DELETE",
    "saved-queries/:id",
    async ({ db }, { params }) => {
      await db.query("DELETE FROM saved_queries WHERE id = ?", [id(params[0])]);
      return { ok: true };
    },
  ],
  [
    "POST",
    "transactions/search",
    async ({ db }, { body }) => {
      const b = TxnSearch.parse(body ?? {});
      const [where, params] = txnWhere(b);
      const order = `${b.sort} ${b.desc ? "DESC" : "ASC"}, id DESC`;
      const [items, total] = await Promise.all([
        db.query(`SELECT * FROM reportable WHERE ${where} ORDER BY ${order} LIMIT ${b.limit} OFFSET ${b.offset}`, params),
        one<{ n: number; s: number | null }>(db, `SELECT COUNT(*) AS n, SUM(amount) AS s FROM reportable WHERE ${where}`, params),
      ]);
      return { items, total: total!.n, sum: total!.s ?? 0 };
    },
  ],
  [
    "POST",
    "transactions/export",
    async ({ db }, { body }) => {
      const [where, params] = txnWhere(TxnSearch.parse(body ?? {}));
      const data = await db.query(
        `SELECT id, date, account, merchant, payee_raw, category, category_group, txn_type AS type,
                amount, currency, array_to_string(tags, ',') AS tags, notes, is_pending, source
         FROM reportable WHERE ${where} ORDER BY date DESC`,
        params,
      );
      const lines = data.length
        ? [Object.keys(data[0]).join(","), ...data.map((r) => Object.values(r).map(csvCell).join(","))]
        : [];
      return new Response(lines.map((l) => `${l}\r\n`).join(""), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=transactions.csv",
        },
      });
    },
  ],
  [
    "POST",
    "transactions/bulk",
    async ({ db }, { body }) => {
      const b = BulkPatch.parse(body);
      await patchTxns(db, b.ids, b.patch);
      return { updated: b.ids.length };
    },
  ],
  [
    "GET",
    "transactions/:id",
    async ({ db }, { params }) => {
      const tid = id(params[0]);
      const found = await one(
        db,
        `SELECT t.*, a.name AS account, c.name AS category FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ?`,
        [tid],
      );
      if (!found) throw new HttpError(404, "transaction not found");
      return { ...found, children: await db.query("SELECT * FROM transactions WHERE parent_id = ?", [tid]) };
    },
  ],
  [
    "POST",
    "transactions",
    async ({ db, settings }, { body }) => {
      const b = TxnIn.parse(body);
      return {
        id: await scalar(
          db,
          `INSERT INTO transactions (source, account_id, date, amount, currency, payee_raw, merchant,
             category_id, tags, notes, type, reviewed, user_edited, raw)
           VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, ?) RETURNING id`,
          [
            b.account_id,
            b.date,
            b.amount,
            settings.currency,
            b.payee,
            b.payee,
            b.category_id ?? null,
            b.tags,
            b.notes ?? null,
            b.type ?? null,
            JSON.stringify(b),
          ],
        ),
      };
    },
  ],
  [
    "PATCH",
    "transactions/:id",
    async ({ db }, { params, body }) => {
      await patchTxns(db, [id(params[0])], TxnPatch.parse(body));
      return { ok: true };
    },
  ],
  [
    "DELETE",
    "transactions/:id",
    async ({ db }, { params }) => {
      const tid = id(params[0]);
      if ((await scalar(db, "SELECT source FROM transactions WHERE id = ?", [tid])) === "plaid")
        throw new HttpError(409, "bank transactions come back on sync; set type to adjustment instead");
      await db.query("DELETE FROM transactions WHERE id = ?", [tid]);
      return { ok: true };
    },
  ],
  [
    "POST",
    "accounts",
    async ({ db }, { body }) => {
      const b = AccountIn.parse(body);
      return {
        id: await scalar(
          db,
          `INSERT INTO accounts (name, type, institution, currency, balance, balance_at)
           VALUES (?, ?, ?, ?, ?, now()) RETURNING id`,
          [b.name, b.type, b.institution ?? null, b.currency.toUpperCase(), b.balance ?? null],
        ),
      };
    },
  ],
  [
    "PATCH",
    "accounts/:id",
    async ({ db }, { params, body }) => {
      const b = AccountPatch.parse(body);
      const fields = Object.entries(b).filter(([k, v]) => v !== undefined && (v !== null || k === "history_cutover"));
      if (fields.length)
        await db.query(`UPDATE accounts SET ${fields.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, [
          ...fields.map(([, v]) => v),
          id(params[0]),
        ]);
      return { ok: true };
    },
  ],
  [
    "POST",
    "accounts/:id/merge",
    async ({ db }, { params, body }) => {
      const from = id(params[0]);
      const { into_id } = MergeIn.parse(body);
      if (from === into_id) throw new HttpError(400, "cannot merge an account into itself");
      await db.tx(async (t) => {
        const src = await one(t, "SELECT source, source_id, plaid_item_id FROM accounts WHERE id = ?", [from]);
        if (!src || (await scalar(t, "SELECT COUNT(*) FROM accounts WHERE id = ?", [into_id])) === 0)
          throw new HttpError(404, "account not found");
        await t.query("UPDATE transactions SET account_id = ? WHERE account_id = ?", [into_id, from]);
        await t.query("DELETE FROM accounts WHERE id = ?", [from]);
        if (src.source_id !== null)
          await t.query("UPDATE accounts SET source = ?, source_id = ?, plaid_item_id = ? WHERE id = ?", [
            src.source,
            src.source_id,
            src.plaid_item_id,
            into_id,
          ]);
      });
      return { ok: true };
    },
  ],
  [
    "DELETE",
    "accounts/:id",
    async ({ db }, { params }) => {
      await db.query("DELETE FROM accounts WHERE id = ?", [id(params[0])]);
      return { ok: true };
    },
  ],
  [
    "POST",
    "categories",
    async ({ db }, { body }) => {
      const b = CategoryIn.parse(body);
      const created = await scalar(
        db,
        `INSERT INTO categories (name, group_name, kind, exclude_from_totals, archived)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT (name) DO NOTHING RETURNING id`,
        [b.name, b.group_name ?? null, b.kind, b.exclude_from_totals, b.archived],
      );
      if (created === undefined) throw new HttpError(409, "a category with that name exists");
      return { id: created };
    },
  ],
  [
    "PUT",
    "categories/:id",
    async ({ db }, { params, body }) => {
      const b = CategoryIn.parse(body);
      await db.query(
        "UPDATE categories SET name = ?, group_name = ?, kind = ?, exclude_from_totals = ?, archived = ? WHERE id = ?",
        [b.name, b.group_name ?? null, b.kind, b.exclude_from_totals, b.archived, id(params[0])],
      );
      return { ok: true };
    },
  ],
  [
    "POST",
    "import/csv",
    async ({ db, settings }, { body }) => importCsv(db, CsvImportSchema.parse(body), settings.currency),
  ],
  ["GET", "sync-runs", async ({ db }) => db.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50")],
  [
    "POST",
    "data/delete-all",
    async ({ db }) => {
      await db.query(
        "TRUNCATE transactions, accounts, categories, plaid_items, sync_runs, saved_queries, idempotency_keys RESTART IDENTITY",
      );
      return { ok: true };
    },
  ],
  [
    "GET",
    "plaid/items",
    async ({ db }) => db.query("SELECT id, item_id, institution, status, error, created_at, last_synced_at FROM plaid_items ORDER BY id"),
  ],
  [
    "POST",
    "plaid/link-token",
    async (ctx) => {
      try {
        return { link_token: await plaid.createLinkToken(ctx.plaid) };
      } catch (e) {
        plaidFailure(e);
      }
    },
  ],
  [
    "POST",
    "plaid/exchange",
    async (ctx, { body }) => {
      const b = PublicTokenIn.parse(body);
      try {
        const item = await plaid.exchangePublicToken(ctx.db, ctx.plaid, b.public_token, b.institution ?? null);
        return { item, ...(await plaid.syncItem(ctx.db, ctx.plaid, item)) };
      } catch (e) {
        plaidFailure(e);
      }
    },
  ],
  [
    "POST",
    "plaid/items/:id/sync",
    async (ctx, { params }) => {
      try {
        return await plaid.syncItem(ctx.db, ctx.plaid, id(params[0]));
      } catch (e) {
        plaidFailure(e);
      }
    },
  ],
  [
    "POST",
    "plaid/items/:id/link-token",
    async (ctx, { params }) => {
      let token: string | null;
      try {
        token = await plaid.createUpdateLinkToken(ctx.db, ctx.plaid, id(params[0]));
      } catch (e) {
        plaidFailure(e);
      }
      if (token === null) throw new HttpError(404, "connection not found");
      return { link_token: token };
    },
  ],
  [
    "POST",
    "plaid/items/:id/reconnected",
    async ({ db }, { params }) => {
      if (!(await plaid.markReconnected(db, id(params[0])))) throw new HttpError(404, "connection not found");
      return { ok: true };
    },
  ],
  ["GET", "cron/sync", async (ctx) => syncAll(ctx)],
];

const IDEMPOTENT = new Set(["import/csv", "plaid/exchange"]);

function match(method: string, path: string[]): [Handler, string[], string] | undefined {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== path.length) continue;
    const params: string[] = [];
    if (parts.every((p, i) => (p === ":id" ? params.push(path[i]) > 0 : p === path[i])))
      return [handler, params, pattern];
  }
}

async function once(db: Db, route: string, key: string, run: () => Promise<unknown>): Promise<unknown> {
  const claimed = await scalar(
    db,
    "INSERT INTO idempotency_keys (route, key) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING key",
    [route, key],
  );
  if (claimed === undefined) {
    const saved = await one<{ response: unknown }>(
      db,
      "SELECT response FROM idempotency_keys WHERE route = ? AND key = ?",
      [route, key],
    );
    if (saved?.response == null) throw new HttpError(409, "a request with this Idempotency-Key is in progress");
    return saved.response;
  }
  try {
    const out = await run();
    await db.query("UPDATE idempotency_keys SET response = ? WHERE route = ? AND key = ?", [
      JSON.stringify(out),
      route,
      key,
    ]);
    return out;
  } catch (e) {
    await db.query("DELETE FROM idempotency_keys WHERE route = ? AND key = ?", [route, key]);
    throw e;
  }
}

const json = (detail: string, status: number) => Response.json({ detail }, { status });

export async function handle(ctx: Ctx, req: Request, path: string[]): Promise<Response> {
  const hit = match(req.method, path);
  if (!hit) return json("not found", 404);
  const [handler, params, pattern] = hit;
  try {
    const text = req.method === "GET" || req.method === "DELETE" ? "" : await req.text();
    const body = text ? JSON.parse(text) : undefined;
    const key = req.headers.get("Idempotency-Key");
    const run = () => handler(ctx, { params, body, req });
    const out = key && IDEMPOTENT.has(pattern) ? await once(ctx.db, pattern, key, run) : await run();
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    if (e instanceof HttpError) return json(e.message, e.status);
    if (e instanceof z.ZodError) return json(z.prettifyError(e), 422);
    if (e instanceof BadRequest || e instanceof SyntaxError) return json(e.message, 422);
    console.error(e);
    return json("internal error", 500);
  }
}

let shared: Promise<Ctx> | undefined;

export function sharedCtx(): Promise<Ctx> {
  shared ??= (async () => {
    const settings = mockSettings(loadSettings());
    const db = await openDb(settings);
    await seedIfEmpty(db);
    return { settings, db, plaid: new plaid.PlaidClient(settings, mockFetch) };
  })().catch((e) => {
    shared = undefined;
    throw e;
  });
  return shared;
}
