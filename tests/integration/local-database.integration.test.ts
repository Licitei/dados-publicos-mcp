import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "@effect/vitest";
import {
  LocalDatabase,
  providers,
  schemaHash,
} from "../../infra/local-database";

const { test } = Test.make({ providers: providers() });

describe("LocalDatabase", () => {
  test.provider("provisiona extensoes e tabelas no dataDir", (stack) =>
    Effect.gen(function* () {
      const dataDir = mkdtempSync(join(tmpdir(), "alchemy-local-db-"));

      const created = yield* LocalDatabase("local-db", { dataDir }).pipe(
        stack.deploy
      );

      expect(created.dataDir).toEqual(dataDir);
      expect(created.tables).toBeGreaterThan(0);
      expect(created.extensions).toContain("vector");
      expect(created.schemaHash).toMatch(/^[0-9a-f]{64}$/);
      expect(created.schemaHash).toEqual(schemaHash());

      yield* stack.destroy();
    })
  );

  test.provider("redeploy e no-op quando o schema nao mudou", (stack) =>
    Effect.gen(function* () {
      const dataDir = mkdtempSync(join(tmpdir(), "alchemy-local-db-"));

      const first = yield* LocalDatabase("local-db", { dataDir }).pipe(
        stack.deploy
      );
      expect(existsSync(dataDir)).toBe(true);

      const plan = yield* stack.plan(LocalDatabase("local-db", { dataDir }));
      const node = Object.values(plan.resources)[0];
      expect(node?.action).toEqual("noop");

      const second = yield* LocalDatabase("local-db", { dataDir }).pipe(
        stack.deploy
      );
      expect(second.schemaHash).toEqual(first.schemaHash);
      expect(second).toEqual(first);

      yield* stack.destroy();
    })
  );

  test.provider("re-provisiona quando o dataDir foi removido do disco", (stack) =>
    Effect.gen(function* () {
      const dataDir = mkdtempSync(join(tmpdir(), "alchemy-local-db-"));

      yield* LocalDatabase("local-db", { dataDir }).pipe(stack.deploy);
      rmSync(dataDir, { recursive: true, force: true });
      expect(existsSync(dataDir)).toBe(false);

      const plan = yield* stack.plan(LocalDatabase("local-db", { dataDir }));
      const node = Object.values(plan.resources)[0];
      expect(node?.action).toEqual("update");

      yield* stack.destroy();
    })
  );
});
