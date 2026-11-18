import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnalyticsQuerySchema } from "@/server/analytics";
import { ask } from "@/server/ask";
import { loadSettings } from "@/server/config";
import type { Db } from "@/server/db";

import { addAccount, addTxn, memoryDb } from "./helpers";
import { FakeAnthropic } from "./support/fake-anthropic";

const settings = { ...loadSettings({} as NodeJS.ProcessEnv), anthropicApiKey: "test-key", model: "test-model" };

let db: Db;
let model: FakeAnthropic;

beforeEach(async () => {
  db = await memoryDb();
  model = new FakeAnthropic();
  const account = await addAccount(db, "Checking");
  await addTxn(db, account, "2026-10-02", -80, "Whole Foods", "Groceries", { tags: ["home"] });
  await addTxn(db, account, "2026-10-05", -120, "Sushi Place", "Restaurants");
});
afterEach(() => db.close());

const QUESTIONS: [string, object][] = [
  ["How much did I spend last month?", { measure: "spending", dimensions: [], filters: { start: "2026-10-01", end: "2026-10-31" } }],
  ["Spending by category this year", { dimensions: ["category"], filters: { start: "2026-01-01", end: "2026-11-18" } }],
  ["Top 10 merchants", { dimensions: ["merchant"], limit: 10 }],
  ["Monthly income", { measure: "income", dimensions: ["month"] }],
  ["Net savings by month", { measure: "net", dimensions: ["month"] }],
  ["Average grocery bill", { metric: "avg", dimensions: [], filters: { category_ids: [1] } }],
  ["Compare this month to last month", { compare: "previous_period", dimensions: ["category"], filters: { start: "2026-10-01", end: "2026-10-31" } }],
  ["Cumulative spending this year", { metric: "cumulative", dimensions: ["month"] }],
  ["Restaurant spending by month as a bar chart", { dimensions: ["month"], chart: "bar", filters: { category_ids: [2] } }],
  ["Spending on each tag", { dimensions: ["tag"] }],
];

describe("ask", () => {
  it.each(QUESTIONS)("turns %j into a valid AnalyticsQuery", async (question, query) => {
    model.answer(query, "explains the query");
    const result = await ask(db, settings, question, model.fetch);
    expect(AnalyticsQuerySchema.safeParse(result.query).success).toBe(true);
    expect(result.explanation).toBe("explains the query");
    expect(model.lastRequest.messages).toEqual([{ role: "user", content: question }]);
  });

  it("sends the model name and the catalog, and never a transaction", async () => {
    model.answer({ dimensions: ["month"] });
    await ask(db, settings, "Show me trends", model.fetch);
    const sent = JSON.stringify(model.lastRequest);
    expect(model.lastRequest.model).toBe("test-model");
    expect(sent).toContain("Groceries");
    expect(sent).toContain("Checking");
    expect(sent).toContain("Top merchants");
    expect(sent).not.toContain("-80");
    expect(sent).not.toMatch(/"amount"/);
  });

  it("fails when the model returns text that is not a query", async () => {
    model.answerText("I cannot do that");
    await expect(ask(db, settings, "Show me trends", model.fetch)).rejects.toThrow();
  });

  it("fails when the model returns a query that breaks the schema", async () => {
    model.answer({ dimensions: ["not-a-dimension"] });
    await expect(ask(db, settings, "Show me trends", model.fetch)).rejects.toThrow();
  });

  it("fails with a clear error when the model refuses", async () => {
    model.refuse();
    await expect(ask(db, settings, "Show me trends", model.fetch)).rejects.toThrow(/could not build a query/);
  });

  it("raises an API error on a 401 without retries", async () => {
    model.fail(401, "authentication_error");
    await expect(ask(db, settings, "Show me trends", model.fetch)).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
    expect(model.requests).toHaveLength(1);
  });

  it("retries a 500 and then succeeds", async () => {
    model.fail(500).answer({ dimensions: ["month"] });
    const result = await ask(db, settings, "Show me trends", model.fetch);
    expect(result.query.dimensions).toEqual(["month"]);
    expect(model.requests).toHaveLength(2);
  });
});
