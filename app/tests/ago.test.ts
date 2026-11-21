import { describe, expect, it } from "vitest";

import { ago } from "@/web/format";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const before = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("ago", () => {
  it.each([
    [null, "never"],
    [undefined, "never"],
    [before(10), "just now"],
    [before(60), "1 minute ago"],
    [before(59 * 60), "59 minutes ago"],
    [before(2 * 3600), "2 hours ago"],
    [before(86_400), "1 day ago"],
    [before(45 * 86_400), "1 month ago"],
    [before(400 * 86_400), "1 year ago"],
    [new Date(NOW + 5000).toISOString(), "just now"],
  ])("%s gives %s", (when, text) => {
    expect(ago(when, NOW)).toBe(text);
  });
});
