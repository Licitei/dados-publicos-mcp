const steps = [
  "lint:oxlint",
  "lint:source-policy",
  "lint:reuse-policy",
  "lint:knip",
  "lint:structure",
  "lint:format",
] as const;

const results = steps.map((step) => ({
  step,
  status: Bun.spawnSync(["bun", "run", step], { stdout: "inherit", stderr: "inherit" }).exitCode,
}));

const failed = results.filter((result) => result.status !== 0);
console.error(
  results.map((result) => `${result.status === 0 ? "ok  " : "FAIL"} ${result.step}`).join("\n")
);
if (failed.length > 0) process.exitCode = 1;
