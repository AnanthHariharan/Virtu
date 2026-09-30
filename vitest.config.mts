import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Evening west of Greenwich: the exact hour a UTC date would roll over.
    env: { TZ: "America/Los_Angeles" },
    setupFiles: ["fake-indexeddb/auto"],
  },
});
