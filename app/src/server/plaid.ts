/**
 * Plaid adapter: Link token, token exchange, accounts, and cursor-based /transactions/sync.
 *
 * Plaid amounts are positive for money out. This app stores negative for money out.
 * The access token is encrypted at rest and never leaves the server.
 */
import type { Settings } from "./config";
import { decrypt, encrypt } from "./crypto";
import { categoryIdFor, one, scalar, type Db, type Row } from "./db";

const HOSTS = { sandbox: "https://sandbox.plaid.com", production: "https://production.plaid.com" };
const MAX_RESTARTS = 3;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class PlaidError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

export class PlaidClient {
  constructor(
    readonly settings: Settings,
    private fetchFn: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.settings.plaidClientId && this.settings.plaidSecret);
  }

  async post(path: string, body: Json): Promise<Json> {
    if (!this.configured) throw new PlaidError("NOT_CONFIGURED", "set PLAID_CLIENT_ID and PLAID_SECRET");
    let resp: Response;
    try {
      resp = await this.fetchFn(`${HOSTS[this.settings.plaidEnv]}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: this.settings.plaidClientId, secret: this.settings.plaidSecret, ...body }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new PlaidError("NETWORK_ERROR", `could not reach Plaid (${path})`);
    }
    const text = await resp.text();
    const data: Json = text ? JSON.parse(text) : {};
    if (resp.status >= 400)
      throw new PlaidError(String(data.error_code ?? resp.status), String(data.error_message ?? "Plaid request failed"));
    return data;
  }
}

export async function createLinkToken(client: PlaidClient): Promise<string> {
  const data = await client.post("/link/token/create", {
    client_name: "Spend Lens",
    language: "en",
    country_codes: ["US", "CA"],
    user: { client_user_id: "owner" },
    products: ["transactions"],
    transactions: { days_requested: 730 },
  });
  return String(data.link_token);
}

export async function exchangePublicToken(
  db: Db,
  client: PlaidClient,
  publicToken: string,
  institution: string | null,
): Promise<number> {
  const data = await client.post("/item/public_token/exchange", { public_token: publicToken });
  const tokenEnc = encrypt(data.access_token, client.settings.appSecretKey);
  return Number(
    await scalar(
      db,
      `INSERT INTO plaid_items (item_id, institution, access_token_enc) VALUES (?, ?, ?)
       ON CONFLICT (item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc, status = 'ok', error = NULL
       RETURNING id`,
      [data.item_id, institution, tokenEnc],
    ),
  );
}

async function upsertAccounts(db: Db, itemPk: number, institution: string | null, accounts: Json[]) {
  for (const a of accounts) {
    const bal = a.balances ?? {};
    await db.query(
      `INSERT INTO accounts (name, type, institution, source, source_id, plaid_item_id, currency, balance, balance_at)
       VALUES (?, ?, ?, 'plaid', ?, ?, ?, ?, now())
       ON CONFLICT (source, source_id) DO UPDATE SET
         balance = excluded.balance, balance_at = excluded.balance_at, type = excluded.type`,
      [
        a.official_name || a.name || "Account",
        a.subtype || a.type || "other",
        institution,
        a.account_id,
        itemPk,
        String(bal.iso_currency_code || "USD").toUpperCase(),
        bal.current ?? null,
      ],
    );
  }
}

const title = (code: string) =>
  code
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

async function category(db: Db, t: Json): Promise<number | null> {
  const { primary, detailed } = t.personal_finance_category ?? {};
  if (!primary) return null;
  const name = detailed?.startsWith(`${primary}_`) ? detailed.slice(primary.length + 1) : primary;
  return categoryIdFor(db, title(name), title(primary));
}

async function fetchAll(client: PlaidClient, token: string, cursor: string | null) {
  for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
    const added: Json[] = [];
    const modified: Json[] = [];
    const removed: Json[] = [];
    let accounts: Json[] = [];
    let next = cursor;
    try {
      for (;;) {
        const page = await client.post("/transactions/sync", {
          access_token: token,
          count: 500,
          ...(next ? { cursor: next } : {}),
        });
        added.push(...(page.added ?? []));
        modified.push(...(page.modified ?? []));
        removed.push(...(page.removed ?? []));
        accounts = page.accounts ?? accounts;
        next = page.next_cursor;
        if (!page.has_more) return { added, modified, removed, accounts, cursor: next };
      }
    } catch (e) {
      if (!(e instanceof PlaidError && e.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION")) throw e;
    }
  }
  throw new PlaidError("SYNC_RESTART_LIMIT", "Plaid data kept changing during sync; try again");
}

async function apply(db: Db, data: Awaited<ReturnType<typeof fetchAll>>): Promise<[number, number, number]> {
  let added = 0;
  let modified = 0;
  let removed = 0;
  for (const t of data.added) {
    const account = await scalar<number | undefined>(
      db,
      "SELECT id FROM accounts WHERE source = 'plaid' AND source_id = ?",
      [t.account_id],
    );
    if (account === undefined) continue;
    const carry: Row | undefined = t.pending_transaction_id
      ? await one(
          db,
          `SELECT category_id, merchant, tags, notes, type, reviewed FROM transactions
           WHERE source = 'plaid' AND source_id = ? AND user_edited`,
          [t.pending_transaction_id],
        )
      : undefined;
    await db.query(
      `INSERT INTO transactions
         (source, source_id, account_id, date, amount, currency, payee_raw, merchant,
          category_id, tags, notes, type, is_pending, reviewed, user_edited, raw)
       VALUES ('plaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, source_id) DO NOTHING`,
      [
        t.transaction_id,
        account,
        t.date,
        -Number(t.amount),
        String(t.iso_currency_code || "USD").toUpperCase(),
        t.name ?? null,
        carry ? carry.merchant : t.merchant_name || t.name,
        carry ? carry.category_id : await category(db, t),
        carry?.tags ?? [],
        carry?.notes ?? null,
        carry?.type ?? null,
        Boolean(t.pending),
        Boolean(carry?.reviewed),
        Boolean(carry),
        JSON.stringify(t),
      ],
    );
    added++;
  }
  for (const t of data.modified) {
    await db.query(
      `UPDATE transactions SET
         date = ?, amount = ?, payee_raw = ?, is_pending = ?, raw = ?, updated_at = now(),
         merchant = CASE WHEN user_edited THEN merchant ELSE ? END,
         category_id = CASE WHEN user_edited THEN category_id ELSE ?::bigint END
       WHERE source = 'plaid' AND source_id = ?`,
      [
        t.date,
        -Number(t.amount),
        t.name ?? null,
        Boolean(t.pending),
        JSON.stringify(t),
        t.merchant_name || t.name,
        await category(db, t),
        t.transaction_id,
      ],
    );
    modified++;
  }
  for (const r of data.removed) {
    await db.query("DELETE FROM transactions WHERE source = 'plaid' AND source_id = ?", [r.transaction_id]);
    removed++;
  }
  return [added, modified, removed];
}

export async function syncItem(db: Db, client: PlaidClient, itemPk: number) {
  const item = await one<{ access_token_enc: string; cursor: string | null; institution: string | null }>(
    db,
    "SELECT * FROM plaid_items WHERE id = ?",
    [itemPk],
  );
  if (!item) throw new PlaidError("NOT_FOUND", "no such connection");
  const runId = await scalar(db, "INSERT INTO sync_runs (source, plaid_item_id) VALUES ('plaid', ?) RETURNING id", [
    itemPk,
  ]);
  let counts: [number, number, number];
  try {
    const token = decrypt(item.access_token_enc, client.settings.appSecretKey);
    const accounts = (await client.post("/accounts/get", { access_token: token })).accounts ?? [];
    const data = await fetchAll(client, token, item.cursor);
    counts = await db.tx(async (t) => {
      await upsertAccounts(t, itemPk, item.institution, data.accounts.length ? data.accounts : accounts);
      const c = await apply(t, data);
      await t.query("UPDATE plaid_items SET cursor = ?, status = 'ok', error = NULL WHERE id = ?", [data.cursor, itemPk]);
      return c;
    });
  } catch (e) {
    if (e instanceof PlaidError) {
      const status = e.code === "ITEM_LOGIN_REQUIRED" ? "reconnect" : "error";
      await db.query("UPDATE plaid_items SET status = ?, error = ? WHERE id = ?", [status, e.message, itemPk]);
      await db.query("UPDATE sync_runs SET status = 'error', error = ?, finished_at = now() WHERE id = ?", [
        e.message,
        runId,
      ]);
    }
    throw e;
  }
  await db.query(
    "UPDATE sync_runs SET status = 'ok', added = ?, modified = ?, removed = ?, finished_at = now() WHERE id = ?",
    [...counts, runId],
  );
  return { added: counts[0], modified: counts[1], removed: counts[2] };
}
