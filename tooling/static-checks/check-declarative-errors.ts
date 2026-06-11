#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Linter de erros declarativos (estilo dfe-kit/evlog) portado para este repo.
 *
 * Roots default: ["src"]. Aceita roots opcionais via process.argv, ex.:
 *   bun tooling/static-checks/check-declarative-errors.ts src/core
 *
 * Regras (mesmas do dfe-kit): proibe instanceof, throw new Error, catch
 * statement, wrappers HTTPError/TimeoutError e funcoes-fabrica de erro.
 * Sai com codigo 1 ao encontrar qualquer violacao.
 */
const argvRoots = process.argv.slice(2);
const requestedRoots = argvRoots.length > 0 ? argvRoots : ["src"];

const roots = requestedRoots.filter((path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
});

const skippedSegments = new Set([
  "dist",
  "node_modules",
  "outputs",
  "docs",
  "__tests__",
  "test",
]);
const skippedSuffixes = [".tsbuildinfo", "README.md"];
const checkedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const checks = [
  {
    pattern:
      /instanceof|throw new Error|catch\s*\(|isHTTPError|isTimeoutError|HTTPError|TimeoutError/,
    message:
      "Use better-result panic for mandatory invariants and typed Result data for recoverable faults. Do not branch on runtime Error wrappers/classes.",
  },
  {
    pattern:
      /(const|function)\s+[A-Za-z0-9_]*(Failure|Fault)[A-Za-z0-9_]*|const\s+[A-Za-z0-9_]*Error[A-Za-z0-9_]*\s*=\s*\([^)]*\)\s*[:=]|:\s*FiscalProviderError\s*=>|\)\s*:\s*FiscalProviderError\s*=>/,
    message:
      "Do not create error/failure helper functions. Build Result.err objects inline at the decision point, from the declarative evlog catalog.",
  },
] satisfies readonly { pattern: RegExp; message: string }[];

const hasCheckedExtension = (path: string): boolean => {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && checkedExtensions.has(path.slice(dot));
};

const shouldSkip = (path: string): boolean => {
  const parts = path.split("/");
  return (
    parts.some((part) => skippedSegments.has(part)) ||
    skippedSuffixes.some((suffix) => path.endsWith(suffix))
  );
};

function* walk(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const normalized = path.replaceAll("\\", "/");
    if (shouldSkip(normalized)) continue;

    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(path);
    else if (stats.isFile() && hasCheckedExtension(normalized)) yield normalized;
  }
}

let failed = false;
for (const file of roots.flatMap((root) => [...walk(root)])) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  for (const check of checks) {
    for (const [index, line] of lines.entries()) {
      if (!check.pattern.test(line)) continue;
      console.error(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
      console.error(`Declarative error handling check failed. ${check.message}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
