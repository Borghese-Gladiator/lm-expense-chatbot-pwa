import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      { find: /^pg$/, replacement: fileURLToPath(new URL("./node_modules/pg", import.meta.url)) },
    ],
  },
  test: { dir: "..", include: ["app/tests/**/*.test.ts", ".awb-proof/**/*.test.ts"], testTimeout: 20_000 },
});
