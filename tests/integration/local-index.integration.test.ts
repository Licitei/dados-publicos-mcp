import { Cause, Effect, Exit } from "effect";
import { sql } from "drizzle-orm";
import * as Test from "alchemy/Test/Vitest";
import { describe, expect } from "@effect/vitest";
import { Db } from "../../src/kernel/db/client";
import { offlineSources } from "./support/offline-app-layer";
import {
  LocalIndex,
  providers,
  type IndexRegistry,
  type LocalIndexConfig,
} from "../../infra/local-index";

const offlineRun = Effect.gen(function* () {
  const db = yield* Db;
  yield* db.execute(
    sql`create table if not exists local_index_probe (id text primary key)`
  );
  yield* db.execute(
    sql`insert into local_index_probe (id) values ('cnae') on conflict do nothing`
  );
  const rows = yield* db.execute(
    sql`select count(*)::int as count from local_index_probe`
  );
  return Number(rows[0].count);
});

const stubRegistry = {
  cnae: { heavy: false, run: () => offlineRun },
} as unknown as IndexRegistry;

const stubConfig: LocalIndexConfig = {
  registry: stubRegistry,
  run: (entry, scope) =>
    Effect.runPromiseExit(entry.run(scope).pipe(Effect.provide(offlineSources))),
};

const failingConfig: LocalIndexConfig = {
  registry: {
    cnae: { heavy: false, run: () => Effect.fail("boom") },
  } as unknown as IndexRegistry,
  run: (entry, scope) =>
    Effect.runPromiseExit(entry.run(scope).pipe(Effect.provide(offlineSources))),
};

const aggregateConfig: LocalIndexConfig = {
  registry: {
    cnae: { heavy: false, run: () => Effect.succeed([2, 3, 4]) },
  } as unknown as IndexRegistry,
  run: (entry, scope) =>
    Effect.runPromiseExit(entry.run(scope).pipe(Effect.provide(offlineSources))),
};

const ok = Test.make({ providers: providers(stubConfig) });
const bad = Test.make({ providers: providers(failingConfig) });
const aggregate = Test.make({ providers: providers(aggregateConfig) });

describe("LocalIndex", () => {
  ok.test.provider("indexa a fonte offline e reporta a contagem", (stack) =>
    Effect.gen(function* () {
      const indexed = yield* LocalIndex("cnae", { fonte: "cnae" }).pipe(
        stack.deploy
      );

      expect(indexed.fonte).toEqual("cnae");
      expect(indexed.rows).toEqual(1);

      yield* stack.destroy();
    })
  );

  bad.test.provider("propaga a falha do pipeline como falha do reconcile", (stack) =>
    Effect.gen(function* () {
      const exit = yield* LocalIndex("cnae", { fonte: "cnae" }).pipe(
        stack.deploy,
        Effect.exit
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("boom");
      }

      yield* stack.destroy().pipe(Effect.ignore);
    })
  );

  aggregate.test.provider(
    "soma contagens quando o pipeline retorna varios numeros",
    (stack) =>
      Effect.gen(function* () {
        const indexed = yield* LocalIndex("cnae", { fonte: "cnae" }).pipe(
          stack.deploy
        );

        expect(indexed.rows).toEqual(9);

        yield* stack.destroy();
      })
  );
});
