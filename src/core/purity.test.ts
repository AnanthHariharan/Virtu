import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `src/core` is imported by the app, and will be by a server worker and an
 * MCP server. It must not reach for the browser, the local store, the
 * network or React — the moment it does, it stops being shareable.
 */
describe("src/core is pure", () => {
  const dir = join(__dirname);
  const files = readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it.each(files)("%s imports nothing from the app's runtime", f => {
    const src = readFileSync(join(dir, f), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
    for (const i of imports) {
      expect(i, `${f} imports ${i}`).toMatch(/^(zod|\.\/[\w-]+)$/);
    }
    expect(src).not.toMatch(/\b(window|document|indexedDB|localStorage)\b/);
    expect(src).not.toMatch(/^"use client"/);
  });
});
