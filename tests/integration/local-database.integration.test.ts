import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "@effect/vitest";
import { LocalDatabase, providers } from "../../infra/local-database";

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

      yield* stack.destroy();
    })
  );
});
