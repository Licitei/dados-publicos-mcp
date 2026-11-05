import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const baseConfig = join(repoRoot, "tooling/lint/oxlint.json");
mkdirSync(join(repoRoot, ".cache"), { recursive: true });
const root = mkdtempSync(join(repoRoot, ".cache", "lint-fixture-"));

const fixtures = {
  "src/kernel/strict.ts":
    "export const kernelValue = (input: string) => {\n  let total = 0;\n  total += input.length;\n  throw new Error(String(total));\n};\n",
  "src/kernel/imports-source.ts":
    'import { sourceValue } from "../sources/capag/store";\n\nexport const kernelUsesSource = sourceValue;\n',
  "src/kernel/http/owner.ts":
    'import { FetchHttpClient } from "effect/http";\n\nexport const owner = FetchHttpClient;\n',
  "src/kernel/duck/imports-http.ts":
    'import { FetchHttpClient } from "effect/http";\n\nexport const dbUsesHttp = FetchHttpClient;\n',
  "src/sources/capag/store.ts":
    "export const sourceValue = (input: string) => {\n  let total = 0;\n  total += input.length;\n  return total;\n};\n",
  "src/sources/capag/imports-sibling.ts":
    'import { other } from "../cnae/store";\n\nexport const crossSlice = other;\n',
  "src/sources/capag/imports-serve.ts":
    'import { served } from "../../serve/tool";\n\nexport const sliceUsesServe = served;\n',
  "src/serve/loose.ts":
    "export const loose = (input: string) => {\n  let total = 0;\n  total += input.length;\n  throw new Error(String(total));\n};\n",
  "src/runtime.ts":
    'import { ManagedRuntime } from "effect";\n\nexport const runtime = ManagedRuntime.make(layer);\n',
  "src/serve/second-runtime.ts":
    'import { ManagedRuntime } from "effect";\n\nexport const extra = ManagedRuntime.make(layer);\n',
  "src/serve/commented.ts": "// narrates the next line\nexport const commented = 1;\n",
  "src/serve/BadName.ts": "export const badName = 1;\n",
  "tests/unit/sample.unit.test.ts":
    'import { it } from "vitest";\n\nit.skip("pending", () => {});\n',
} satisfies Record<string, string>;

const config = { extends: [baseConfig], options: { typeAware: false } };

const lintFixture = () => {
  for (const [path, source] of Object.entries(fixtures)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  writeFileSync(join(root, "oxlint.json"), JSON.stringify(config));
  const result = spawnSync(
    join(repoRoot, "node_modules/.bin/effect-tsgo"),
    ["oxlint", "-c", "oxlint.json", "--no-ignore", "--format", "json", ...Object.keys(fixtures)],
    { cwd: root, encoding: "utf8" }
  );
  const report: { diagnostics: ReadonlyArray<{ code: string; filename: string }> } = JSON.parse(
    result.stdout
  );
  return report.diagnostics.map((diagnostic) => `${diagnostic.filename}|${diagnostic.code}`);
};

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("native oxlint tiers and overrides", () => {
  const found = lintFixture();
  const has = (file: string, rule: string) =>
    found.some((entry) => entry.startsWith(`${file}|`) && entry.includes(rule));

  it("applies the strict tier to kernel and sources", () => {
    expect(has("src/kernel/strict.ts", "no-let-var")).toBe(true);
    expect(has("src/kernel/strict.ts", "no-mutation-accumulator")).toBe(true);
    expect(has("src/sources/capag/store.ts", "no-let-var")).toBe(true);
  });

  it("applies only the universal tier outside kernel and sources", () => {
    expect(has("src/serve/loose.ts", "no-throw")).toBe(true);
    expect(has("src/serve/loose.ts", "no-let-var")).toBe(false);
    expect(has("src/serve/loose.ts", "no-mutation-accumulator")).toBe(false);
  });

  it("encodes the architecture boundaries as restricted imports", () => {
    expect(has("src/kernel/imports-source.ts", "no-restricted-imports")).toBe(true);
    expect(has("src/sources/capag/imports-sibling.ts", "no-restricted-imports")).toBe(true);
    expect(has("src/sources/capag/imports-serve.ts", "no-restricted-imports")).toBe(true);
    expect(has("src/kernel/duck/imports-http.ts", "no-restricted-imports")).toBe(true);
    expect(has("src/kernel/http/owner.ts", "no-restricted-imports")).toBe(false);
  });

  it("owns the process runtime in src/runtime.ts only", () => {
    expect(has("src/runtime.ts", "no-extra-managed-runtime")).toBe(false);
    expect(has("src/serve/second-runtime.ts", "no-extra-managed-runtime")).toBe(true);
  });

  it("applies comment and filename policy to authored code", () => {
    expect(has("src/serve/commented.ts", "no-source-comments")).toBe(true);
    expect(has("src/serve/BadName.ts", "filename-case")).toBe(true);
  });

  it("applies test rules under tests", () => {
    expect(has("tests/unit/sample.unit.test.ts", "no-test-timeout-or-skip")).toBe(true);
  });
});
