import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`));
  return problems;
}

async function restoreMockBank(page: Page) {
  const res = await page.request.post("/api/plaid/exchange", {
    data: { public_token: "mock-public-token", institution: "Mock Bank" },
    headers: { "Idempotency-Key": `restore-${Date.now()}-${Math.random()}` },
  });
  expect(res.ok()).toBe(true);
}

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function addImportedTransaction(page: Page, name: string, amount: number) {
  const accounts = await (await page.request.get("/api/meta")).json();
  const csv = `date,payee,amount\n2026-10-15,${name},${amount}\n`;
  const res = await page.request.post("/api/import/csv", {
    data: { csv_text: csv, account_id: accounts.accounts[0].id, sign: "negative_is_expense" },
  });
  expect(res.ok()).toBe(true);
  const found = await (
    await page.request.post("/api/transactions/search", { data: { filters: { search: name, include_pending: true }, limit: 5 } })
  ).json();
  expect(found.items).toHaveLength(1);
  return found.items[0].id as number;
}

test.describe("Accounts page", () => {
  test("groups accounts under a bank, shows the type label, and links an account to its transactions", async ({ page }) => {
    const problems = watch(page);
    await signIn(page);
    await page.goto("/#accounts");
    await expect(page.getByRole("button", { name: "Sync all" })).toBeVisible();
    await expect(page.getByText(/^Mock Bank \(\d+\)$/)).toBeVisible();
    await expect(page.getByText("Accounts with no bank link")).toBeVisible();

    await page.getByRole("link", { name: /View transactions for Mock Bank Checking/ }).click();
    await expect(page).toHaveURL(/#transactions\?account=\d+/);
    await expect(page.getByRole("table").first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("shows a banner on every other page when a bank needs a new sign-in", async ({ page }) => {
    await signIn(page);
    await page.goto("/#overview");
    const banner = page.getByRole("alert").filter({ hasText: "needs attention" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Mock Credit Union");
    await banner.getByRole("link", { name: "Open Accounts" }).click();
    await expect(page).toHaveURL(/#accounts/);
    await expect(page.getByRole("alert").filter({ hasText: "A bank connection needs attention" })).toBeVisible();
  });

  test("renames a connection and keeps the name after a reload", async ({ page }) => {
    await signIn(page);
    await restoreMockBank(page);
    await page.goto("/#accounts");
    const name = `Renamed ${stamp()}`;
    await page.getByRole("region", { name: "Mock Bank" }).getByRole("button", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename connection" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("region", { name })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name })).toBeVisible();

    await page.getByRole("region", { name }).getByRole("button", { name: "Rename" }).click();
    await page.getByRole("dialog", { name: "Rename connection" }).getByRole("textbox", { name: "Name" }).fill("Mock Bank");
    await page.getByRole("dialog", { name: "Rename connection" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("region", { name: "Mock Bank" })).toBeVisible();
  });

  test("disconnects a bank, keeps its accounts and rows, and a re-add brings the link back", async ({ page }) => {
    await signIn(page);
    await restoreMockBank(page);
    await page.goto("/#accounts");
    page.on("dialog", (d) => d.accept());

    const group = page.getByRole("region", { name: "Mock Bank" });
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("menuitem", { name: "Disconnect, keep transactions" }).click();
    await expect(page.getByText("Disconnected Mock Bank. Its transactions stay.")).toBeVisible();
    await expect(group).toHaveCount(0);
    await expect(page.getByRole("link", { name: /View transactions for Mock Bank Checking/ })).toBeVisible();

    await page.getByRole("button", { name: "Add mock bank" }).click();
    await expect(page.getByText(/Connected \(mock\)/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Mock Bank" })).toBeVisible();
  });

  test("Sync all reports a result", async ({ page }) => {
    await signIn(page);
    await page.goto("/#accounts");
    await page.getByRole("button", { name: "Sync all" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Synced \d+ of \d+ connections/ })).toBeVisible();
  });
});

test.describe("Split a transaction", () => {
  test("splits a row, shows the amount left, saves, and removes the split", async ({ page }) => {
    const problems = watch(page);
    await signIn(page);
    const name = `Split ${stamp()}`;
    await addImportedTransaction(page, name, -120);

    await page.goto("/#transactions");
    await page.getByLabel("Search").fill(name);
    await page.getByRole("table").first().getByText(name).first().click();
    await page.getByRole("button", { name: "Split this transaction" }).click();

    await page.getByRole("textbox", { name: "Part 1 amount" }).fill("80");
    await expect(page.getByRole("status").filter({ hasText: "40.00" })).toContainText("left to assign");
    await expect(page.getByRole("button", { name: "Save split" })).toBeDisabled();

    await page.getByRole("textbox", { name: "Part 2 amount" }).fill("40");
    await expect(page.getByText("The parts add up.")).toBeVisible();
    await page.getByRole("button", { name: "Save split" }).click();
    await expect(page.getByRole("button", { name: "Edit split" })).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Remove split" }).click();
    await expect(page.getByRole("button", { name: "Split this transaction" })).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe("Merchants and rules", () => {
  test("merges two merchant names into one and undoes it", async ({ page }) => {
    await signIn(page);
    const a = `Alpha${stamp()}`;
    const b = `Beta${stamp()}`;
    await addImportedTransaction(page, a, -10);
    await addImportedTransaction(page, b, -20);

    await page.goto("/#settings");
    await page.getByRole("textbox", { name: "Search merchants" }).fill(`${a.slice(0, 5)}`);
    await page.getByLabel(`Select ${a}`).check();
    await page.getByRole("textbox", { name: "Search merchants" }).fill(`${b.slice(0, 4)}`);
    await page.getByLabel(`Select ${b}`).check();
    await page.getByRole("button", { name: /Merge 2 selected/ }).click();

    const target = `Merged${stamp()}`;
    await page.getByRole("textbox", { name: "New name" }).fill(target);
    await page.getByRole("button", { name: "Save" }).last().click();
    await expect(page.getByRole("status").filter({ hasText: `Renamed to ${target}` })).toContainText("2 rows changed");

    await page.getByRole("textbox", { name: "Search merchants" }).fill(target);
    await expect(page.getByRole("table", { name: "Merchants list" }).getByText(target)).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).first().click();
    await page.getByRole("textbox", { name: "Search merchants" }).fill(a);
    await expect(page.getByRole("table", { name: "Merchants list" }).getByText(a, { exact: true })).toBeVisible();
  });

  test("makes a rule from a transaction and lists the matching rows in the preview", async ({ page }) => {
    await signIn(page);
    const name = `RuleSrc${stamp()}`;
    await addImportedTransaction(page, name, -33);

    await page.goto("/#transactions");
    await page.getByLabel("Search").fill(name);
    await page.getByRole("table").first().getByText(name).first().click();
    await page.getByRole("link", { name: "Make a rule from this transaction" }).click();

    await expect(page).toHaveURL(/#settings/);
    await expect(page.getByRole("textbox", { name: "Text contains" })).toHaveValue(name);
    await page.getByRole("textbox", { name: "Set merchant" }).fill("Rule Result");
    await page.getByRole("button", { name: "Add rule" }).click();

    const row = page.getByRole("table", { name: "Rules list" }).getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByLabel("Rule preview")).toContainText("matches 1 row");
    await expect(page.getByLabel("Rule preview")).toContainText(name);
  });

  test("edits a rule", async ({ page }) => {
    await signIn(page);
    const text = `EditMe${stamp()}`;
    await page.goto("/#settings");
    await page.getByRole("textbox", { name: "Text contains" }).fill(text);
    await page.getByRole("textbox", { name: "Set merchant" }).fill("First");
    await page.getByRole("button", { name: "Add rule" }).click();

    const row = page.getByRole("table", { name: "Rules list" }).getByRole("row").filter({ hasText: text });
    await expect(row).toContainText("merchant First");
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Set merchant" }).fill("Second");
    await page.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByRole("table", { name: "Rules list" }).getByRole("row").filter({ hasText: text })).toContainText("merchant Second");
  });
});

test.describe("Explore with trips", () => {
  test("groups by trip and filters to one trip", async ({ page }) => {
    const problems = watch(page);
    await signIn(page);
    const tripName = `Trip ${stamp()}`;
    const txn = await addImportedTransaction(page, `TripBuy${stamp()}`, -250);
    const trip = await (await page.request.post("/api/trips", { data: { name: tripName } })).json();
    expect((await page.request.post(`/api/trips/${trip.id}/transactions`, { data: { transaction_id: txn } })).ok()).toBe(true);

    await page.goto("/#explore");
    await page.getByRole("combobox", { name: "Period" }).click();
    await page.getByRole("option", { name: "All time" }).click();
    await page.getByRole("combobox", { name: "Group by" }).click();
    await page.getByRole("option", { name: "Trip", exact: true }).click();
    await page.getByRole("radiogroup", { name: "View" }).getByText("Table", { exact: true }).click();
    const table = page.getByRole("table").last();
    await expect(table.getByRole("row", { name: new RegExp(tripName) })).toContainText("$250");
    await expect(table.getByRole("row", { name: /\(no trip\)/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Trip" }).click();
    await page.getByRole("option", { name: tripName }).click();
    await expect(table.getByRole("row", { name: new RegExp(tripName) })).toContainText("$250");
    await expect(table.getByRole("row", { name: /\(no trip\)/ })).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
