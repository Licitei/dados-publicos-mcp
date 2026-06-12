import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.unit.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
});
