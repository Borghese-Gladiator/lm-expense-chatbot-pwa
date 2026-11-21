import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function restoreMockBank(page: Page) {
  const res = await page.request.post("/api/plaid/exchange", {
    data: { public_token: "mock-public-token", institution: "Mock Bank" },
    headers: { "Idempotency-Key": `restore-${Date.now()}-${Math.random()}` },
  });
  expect(res.ok()).toBe(true);
}

test.describe.configure({ mode: "serial" });

test.describe("destructive flows (file name sorts last so other files see the seed)", () => {
  test("disconnect and delete removes the bank, its accounts, and its rows", async ({ page, viewport }) => {
    test.skip(!process.env.E2E_DESTRUCTIVE || (viewport?.width ?? 1280) < 768, "it deletes seed data. Run it alone with E2E_DESTRUCTIVE=1 on the desktop project");
    await signIn(page);
    await restoreMockBank(page);
    await page.goto("/#accounts");
    page.on("dialog", (d) => d.accept());
    await expect(page.getByRole("link", { name: /View transactions for Mock Bank Checking/ })).toBeVisible();

    await page.getByRole("region", { name: "Mock Bank" }).getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("menuitem", { name: "Disconnect and delete transactions" }).click();
    await expect(page.getByText("Disconnected Mock Bank and deleted its data.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Mock Bank" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /View transactions for Mock Bank Checking/ })).toHaveCount(0);

    await restoreMockBank(page);
  });

});
