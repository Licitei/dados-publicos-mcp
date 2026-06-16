import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 120_000,
  },
});
