import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

it("ships no service worker that could cache /api/ responses", () => {
  for (const f of ["sw.js", "service-worker.js", "serviceworker.js"]) {
    expect(existsSync(join(root, "public", f))).toBe(false);
  }
  for (const f of walk(join(root, "src"))) {
    if (!/\.(tsx?|jsx?)$/.test(f)) continue;
    const text = readFileSync(f, "utf8");
    expect(text, f).not.toMatch(/serviceWorker\.register|caches\.open|CacheStorage/);
  }
});

it("answers an unsigned /api/ request from the server, never from a cache", async () => {
  const { authorize } = await import("@/auth");
  const res = await authorize(new Request("http://test/api/accounts"), { APP_PASSWORD: "x" } as unknown as NodeJS.ProcessEnv);
  expect(res?.status).toBe(401);
});
