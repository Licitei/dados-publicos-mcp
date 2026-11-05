import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.unit.test.ts", "tooling/lint/__tests__/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
