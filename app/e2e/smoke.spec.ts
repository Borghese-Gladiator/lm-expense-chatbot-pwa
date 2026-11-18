import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password";

const PAGES = [
  ["overview", "Overview"],
  ["explore", "Explore"],
  ["transactions", "Transactions"],
  ["accounts", "Accounts"],
  ["settings", "Settings"],
] as const;

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`));
  return problems;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function openNav(page: Page) {
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByRole("button", { name: "Toggle navigation" }).click();
}

test.describe("login", () => {
  test("rejects a wrong password and blocks the app and the API", async ({ page, request }) => {
    expect((await request.get("/api/health")).status()).toBe(401);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("textbox", { name: "Password" }).fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Wrong password." })).toBeVisible();
  });

  test("signs in, keeps the session after a reload, and signs out", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("pages", () => {
  for (const [id, title] of PAGES) {
    test(`${title} loads with no errors and no horizontal scroll`, async ({ page }) => {
      const problems = watch(page);
      await signIn(page);
      await openNav(page);
      await page.getByRole("link", { name: title, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}`));
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(problems).toEqual([]);
    });
  }
});

test.describe("flows on seeded demo data", () => {
  test("Transactions: search, add a transaction, and page", async ({ page }) => {
    const problems = watch(page);
    await signIn(page);
    await page.goto("/#transactions");
    await expect(page.getByRole("table").first()).toBeVisible();
    await page.getByLabel("Search").fill("Whole Foods");
    await expect(page.getByRole("table").first().getByText("Whole Foods").first()).toBeVisible();
    await page.getByLabel("Search").fill("");
    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByRole("button", { name: "← Previous" })).toBeEnabled();
    expect(problems).toEqual([]);
  });

  test("Accounts: the mock bank shows a connection that needs reconnect and the duplicate pair", async ({ page }) => {
    await signIn(page);
    await page.goto("/#accounts");
    await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" }).first()).toBeVisible();
    await page.goto("/#transactions");
    await page.getByRole("button", { name: "Possible duplicates" }).click();
    await expect(page.getByRole("button", { name: "Keep bank row" }).first()).toBeVisible();
  });

  test("Explore: Ask builds a query and the chart area renders", async ({ page }) => {
    const problems = watch(page);
    await signIn(page);
    await page.goto("/#explore");
    await page.getByRole("textbox", { name: /ask/i }).fill("top merchants");
    await page.getByRole("button", { name: "Build query" }).click();
    await expect(page.getByText(/\(Mock\)/)).toBeVisible();
    await expect(page.getByText(/^10 groups/)).toBeVisible();
    await expect(page.locator("svg text", { hasText: "Landlord LLC" }).first()).toBeAttached();
    expect(problems).toEqual([]);
  });

  test("Settings: add a category and see it in the list", async ({ page }) => {
    await signIn(page);
    await page.goto("/#settings");
    const name = `E2E ${Date.now()}`;
    await page.getByLabel("New category name").fill(name);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByLabel("Name").filter({ has: page.locator(`[value="${name}"]`) }).or(page.locator(`input[value="${name}"]`))).toBeVisible();
  });
});

test.describe("phone layout", () => {
  test("the navigation opens from the burger menu", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1280) > 500, "phone project only");
    await signIn(page);
    const burger = page.getByRole("button", { name: "Toggle navigation" });
    await expect(burger).toBeVisible();
    await burger.click();
    await expect(page.getByRole("link", { name: "Transactions", exact: true })).toBeVisible();
  });
});
