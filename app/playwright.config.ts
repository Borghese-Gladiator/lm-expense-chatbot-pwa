import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3211);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 667 }, hasTouch: true } },
  ],
  webServer: {
    command: `rm -rf .data/e2e-pglite && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      APP_PASSWORD: "e2e-password",
      ROOT_SECRET: "e2e-root-secret",
      PGLITE_DIR: ".data/e2e-pglite",
      DATABASE_URL: "",
      DATABASE_URL_POOLED: "",
      PLAID_CLIENT_ID: "",
      PLAID_SECRET: "",
      ANTHROPIC_API_KEY: "",
      VERCEL: "",
    },
  },
});
