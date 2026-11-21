import { describe, expect, it, vi } from "vitest";

import { hasLivePlaid, mockSettings, routedFetch } from "@/server/mock";
import { loadSettings } from "@/server/config";

const call = (fetchFn: typeof fetch, body: object) =>
  fetchFn("https://sandbox.plaid.com/accounts/get", { method: "POST", body: JSON.stringify(body) });

describe("routedFetch", () => {
  it.each([
    ["mock access token", { access_token: "mock-access-token" }, false],
    ["mock public token", { public_token: "mock-public-token" }, false],
    ["real access token", { access_token: "access-sandbox-1" }, true],
    ["link token request with no token", {}, true],
  ])("%s", async (_name, body, goesToPlaid) => {
    const real = vi.fn(async () => Response.json({ real: true }));
    await call(routedFetch(real as unknown as typeof fetch), body);
    expect(real).toHaveBeenCalledTimes(goesToPlaid ? 1 : 0);
  });
});

describe("mockSettings", () => {
  it("keeps real keys", () => {
    const s = mockSettings(loadSettings({ PLAID_CLIENT_ID: "cid", PLAID_SECRET: "sec" } as unknown as NodeJS.ProcessEnv));
    expect([s.plaidClientId, s.plaidSecret]).toEqual(["cid", "sec"]);
  });

  it.each([
    [{}, false],
    [{ PLAID_CLIENT_ID: "cid" }, false],
    [{ PLAID_CLIENT_ID: "cid", PLAID_SECRET: "sec" }, true],
  ])("hasLivePlaid %j is %s", (env, live) => {
    expect(hasLivePlaid(loadSettings(env as unknown as NodeJS.ProcessEnv))).toBe(live);
  });
});
