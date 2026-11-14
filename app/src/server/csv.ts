/**
 * CSV import with header aliases and idempotent dedupe.
 *
 * Works with the Lunch Money transaction export and most bank exports.
 * Dedupe key: the file's own id column when present, otherwise a hash of
 * (account, date, amount, payee) plus how many times that tuple already appeared in the file.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

import { BadRequest } from "./analytics";
import { categoryIdFor, scalar, type Db } from "./db";
import { applyRules } from "./rules";

const ALIASES: Record<string, string[]> = {
  id: ["id", "transaction id", "transaction_id"],
  date: ["date", "transaction date", "posted date", "posting date", "booking date"],
  payee: ["payee", "description", "merchant", "name", "original_name", "memo"],
  amount: ["amount", "transaction amount", "value"],
  debit: ["debit", "withdrawal", "money out", "outflow"],
  credit: ["credit", "deposit", "money in", "inflow"],
  currency: ["currency"],
  category: ["category", "category name", "category_name"],
  group: ["category group", "category_group", "group"],
  tags: ["tags", "tag", "labels"],
  notes: ["notes", "note"],
  account: ["account", "account name", "account_name", "asset", "plaid account name"],
  status: ["status"],
  is_income: ["is_income", "is income"],
};

export const CsvImportSchema = z.object({
  csv_text: z.string(),
  account_id: z.number().int().nullish(),
  sign: z.enum(["negative_is_expense", "positive_is_expense"]).default("negative_is_expense"),
  date_format: z.string().nullish(),
});
export type CsvImportRequest = z.infer<typeof CsvImportSchema>;

/** RFC 4180 parser: quoted fields, doubled quotes, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const DATE_PATTERNS: [string, RegExp, (m: RegExpMatchArray) => [number, number, number]][] = [
  ["%Y-%m-%d", /^(\d{4})-(\d{1,2})-(\d{1,2})$/, (m) => [+m[1], +m[2], +m[3]]],
  ["%m/%d/%Y", /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => [+m[3], +m[1], +m[2]]],
  ["%m/%d/%y", /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, (m) => [2000 + +m[3], +m[1], +m[2]]],
  ["%d/%m/%Y", /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => [+m[3], +m[2], +m[1]]],
  ["%Y/%m/%d", /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, (m) => [+m[1], +m[2], +m[3]]],
  ["%d.%m.%Y", /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, (m) => [+m[3], +m[2], +m[1]]],
];

function parseDate(value: string, format?: string | null): string {
  for (const [name, re, pick] of DATE_PATTERNS) {
    if (format && name !== format) continue;
    const m = value.trim().match(re);
    if (!m) continue;
    const [y, mo, d] = pick(m);
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) return date.toISOString().slice(0, 10);
  }
  throw new RowError(`cannot read date '${value}'`);
}

class RowError extends Error {}

/** Returns cents, so sums stay exact. */
function parseCents(value: string): number {
  let cleaned = value.trim().replace(/[,$€£]/g, "");
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  cleaned = cleaned.replace(/^\(|\)$/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) throw new RowError(`cannot read amount '${value}'`);
  const cents = Math.round(Number(cleaned) * 100);
  return negative ? -cents : cents;
}

async function accountFor(db: Db, name: string, currency: string, created: string[]): Promise<number> {
  const existing = await scalar<number | undefined>(db, "SELECT id FROM accounts WHERE lower(name) = lower(?)", [name]);
  if (existing !== undefined) return Number(existing);
  created.push(name);
  return Number(
    await scalar(db, "INSERT INTO accounts (name, source, currency) VALUES (?, 'csv', ?) RETURNING id", [name, currency]),
  );
}

export async function importCsv(db: Db, req: CsvImportRequest, currency: string) {
  const [headers, ...body] = parseCsv(req.csv_text.replace(/^﻿/, ""));
  if (!headers) throw new BadRequest("the file has no header row");
  const lowered = new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]));
  const m: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const hit = names.find((n) => lowered.has(n));
    if (hit !== undefined) m[field] = lowered.get(hit)!;
  }
  if (!("date" in m)) throw new BadRequest("no date column found");
  if (!("amount" in m) && !("debit" in m || "credit" in m))
    throw new BadRequest("no amount, debit or credit column found");
  if (!("account" in m) && req.account_id == null)
    throw new BadRequest("choose an account, or include an account column");

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  const created: string[] = [];
  const seen = new Map<string, number>();
  const newIds: number[] = [];

  await db.tx(async (t) => {
    for (const [index, cells] of body.entries()) {
      const get = (field: string) => (field in m ? (cells[m[field]] ?? "").trim() : "");
      try {
        const date = parseDate(get("date"), req.date_format);
        let cents: number;
        if ("amount" in m && get("amount")) {
          cents = parseCents(get("amount"));
          if (req.sign === "positive_is_expense") cents = -cents;
        } else {
          const debit = get("debit") ? parseCents(get("debit")) : 0;
          const credit = get("credit") ? parseCents(get("credit")) : 0;
          cents = Math.abs(credit) - Math.abs(debit);
        }
        const amount = (cents / 100).toFixed(2);
        const rowCurrency = (get("currency") || currency).toUpperCase();
        const accountId =
          req.account_id ?? (await accountFor(t, get("account") || "Imported", rowCurrency, created));
        const payee = get("payee") || null;

        let sourceId = get("id");
        if (!sourceId) {
          const base = `${accountId}|${date}|${amount}|${(payee ?? "").toLowerCase()}`;
          seen.set(base, (seen.get(base) ?? 0) + 1);
          const hash = createHash("sha256").update(`${base}|${seen.get(base)}`).digest("hex").slice(0, 24);
          sourceId = `${accountId}:${hash}`;
        }
        if (await scalar(t, "SELECT 1 FROM transactions WHERE source = 'csv' AND source_id = ?", [sourceId])) {
          skipped++;
          continue;
        }
        const categoryId = get("category") ? await categoryIdFor(t, get("category"), get("group") || null) : null;
        const tags = get("tags").split(",").map((s) => s.trim()).filter(Boolean);
        const raw = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
        const [ins] = await t.query<{ id: number }>(
          `INSERT INTO transactions
             (source, source_id, account_id, date, amount, currency, payee_raw,
              merchant, category_id, tags, notes, type, is_pending, raw)
           VALUES ('csv', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            sourceId,
            accountId,
            date,
            amount,
            rowCurrency,
            payee,
            payee,
            categoryId,
            tags,
            get("notes") || null,
            get("is_income").toLowerCase() === "true" ? "income" : null,
            get("status").toLowerCase() === "pending",
            JSON.stringify(raw),
          ],
        );
        newIds.push(Number(ins.id));
        added++;
      } catch (e) {
        if (!(e instanceof RowError)) throw e;
        errors.push(`line ${index + 2}: ${e.message}`);
      }
    }
    await applyRules(t, newIds);
  });

  await db.query(
    `INSERT INTO sync_runs (source, finished_at, status, added, error) VALUES ('csv', now(), ?, ?, ?)`,
    [errors.length ? "partial" : "ok", added, errors.slice(0, 5).join("; ") || null],
  );
  return { added, skipped_duplicates: skipped, errors, accounts_created: created };
}
