export interface Settings {
  databaseUrl: string;
  pgliteDir: string;
  currency: string;
  appSecretKey: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: "sandbox" | "production";
  anthropicApiKey: string;
  model: string;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  return {
    databaseUrl: env.DATABASE_URL ?? "",
    pgliteDir: env.PGLITE_DIR ?? ".data/pglite",
    currency: env.CURRENCY ?? "USD",
    appSecretKey: env.APP_SECRET_KEY ?? "",
    plaidClientId: env.PLAID_CLIENT_ID ?? "",
    plaidSecret: env.PLAID_SECRET ?? "",
    plaidEnv: env.PLAID_ENV === "production" ? "production" : "sandbox",
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
    model: env.MODEL ?? "claude-opus-5-5",
  };
}
