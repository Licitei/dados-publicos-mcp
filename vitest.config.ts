import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.unit.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
