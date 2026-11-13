/** Make .env from .env.example with new secrets, then seed the demo data. Usage: npm run setup */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";

import { loadSettings } from "../src/server/config";
import { openDb, scalar } from "../src/server/db";
import { seedDemo } from "../src/server/mock";

const SECRETS = ["APP_SECRET_KEY", "CRON_SECRET"];

export function writeEnv(dir: string): boolean {
  const env = join(dir, ".env");
  if (existsSync(env)) return false;
  let text = readFileSync(join(dir, ".env.example"), "utf8");
  for (const key of SECRETS) {
    const line = `${key}=${randomBytes(32).toString("hex")}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(env, text);
  return true;
}

export async function setup(dir: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  writeEnv(dir);
  const settings = loadSettings({ ...parseEnv(readFileSync(join(dir, ".env"), "utf8")), ...env });
  if (!isAbsolute(settings.pgliteDir)) settings.pgliteDir = join(dir, settings.pgliteDir);
  const db = await openDb(settings);
  try {
    if (Number(await scalar(db, "SELECT count(*) FROM transactions")) > 0) return 0;
    return await seedDemo(db);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const n = await setup(process.cwd());
  console.log(n ? `seeded ${n} transactions` : "database already has data, seed skipped");
}
