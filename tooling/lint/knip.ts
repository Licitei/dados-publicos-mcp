import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["infra/alchemy.run.ts", "infra/*.run.ts", "tooling/**/*.ts", "tests/**/*.test.ts"],
  project: ["src/**/*.ts", "infra/**/*.ts", "tests/**/*.ts", "tooling/**/*.ts"],
  ignoreDependencies: ["@effect/language-service"],
};

export default config;
