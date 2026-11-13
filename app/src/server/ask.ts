/** Natural language -> AnalyticsQuery. Only names (no transactions) go to the model. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { AnalyticsQuerySchema } from "./analytics";
import type { Settings } from "./config";
import type { Db } from "./db";

const AskResult = z.object({ query: AnalyticsQuerySchema, explanation: z.string() });
export type AskResult = z.infer<typeof AskResult>;

const SYSTEM = `You turn personal-finance questions into an AnalyticsQuery for a reporting engine.
You never see transactions. You only choose measures, dimensions, filters and comparisons.

Rules:
- "spending" is money out (expenses minus refunds). "income" is income. "net" is income minus spending.
- Transfers are never counted. Do not try to filter them out.
- Resolve relative dates ("last month", "this year", "last 6 months") against today's date.
- For "why did X change" or "compare" questions, set compare and leave time dimensions out.
- Use category_ids / account_ids from the catalog. Use exact merchant, group and tag names.
- Use the explanation to say, in one or two sentences, what the query shows and any assumption.`;

async function catalog(db: Db): Promise<string> {
  const [cats, accts, tags, merchants, bounds] = await Promise.all([
    db.query<{ id: number; name: string; group_name: string | null }>(
      "SELECT id, name, group_name FROM categories WHERE NOT archived ORDER BY name",
    ),
    db.query<{ id: number; name: string }>("SELECT id, name FROM accounts WHERE NOT archived ORDER BY name"),
    db.query<{ t: string }>("SELECT DISTINCT unnest(tags) AS t FROM transactions ORDER BY t"),
    db.query<{ merchant: string }>(
      "SELECT merchant FROM reportable GROUP BY merchant ORDER BY COUNT(*) DESC LIMIT 200",
    ),
    db.query<{ lo: string; hi: string }>("SELECT MIN(date) AS lo, MAX(date) AS hi FROM transactions"),
  ]);
  return [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Data covers: ${bounds[0]?.lo} to ${bounds[0]?.hi}`,
    "Categories (id: name [group]): " + cats.map((c) => `${c.id}: ${c.name} [${c.group_name ?? "-"}]`).join("; "),
    "Accounts (id: name): " + accts.map((a) => `${a.id}: ${a.name}`).join("; "),
    "Tags: " + tags.map((t) => t.t).join(", "),
    "Top merchants: " + merchants.map((m) => m.merchant).join(", "),
  ].join("\n");
}

export async function ask(db: Db, settings: Settings, question: string): Promise<AskResult> {
  const client = new Anthropic({ apiKey: settings.anthropicApiKey, timeout: 60_000, maxRetries: 2 });
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(AskResult) },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: await catalog(db) },
    ],
    messages: [{ role: "user", content: question }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output)
    throw new Error("the model could not build a query for that question");
  return response.parsed_output;
}
