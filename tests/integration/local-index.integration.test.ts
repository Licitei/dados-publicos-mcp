import { Effect, Schema } from "effect";
import * as Test from "@alchemy.run/test/Vitest";
import { describe, expect } from "@effect/vitest";
import { Duck } from "../../src/kernel/duck/duck";
import { IndexFailure, indexRegistry } from "../../src/serve/index-registry";
import { withOfflineSources } from "./support/offline-app-layer";
import { LocalIndex, providers, type LocalIndexConfig } from "../../infra/local-index";
import { deploy, destroy, destroyIgnored } from "./support/stack";

const offlineRun = Effect.gen(function* () {
  const duck = yield* Duck;
  yield* duck.run("CREATE TABLE IF NOT EXISTS local_index_probe (id VARCHAR PRIMARY KEY)");
  yield* duck.run("INSERT INTO local_index_probe (id) VALUES ('cnae') ON CONFLICT DO NOTHING");
  const rows = yield* duck.query(
    Schema.Struct({ count: Schema.Finite }),
    "SELECT count(*)::INTEGER AS count FROM local_index_probe"
  );
  return rows[0]?.count ?? 0;
}).pipe(Effect.mapError((error) => IndexFailure.make({ text: error.message })));

const registryWith = (run: (typeof indexRegistry)["cnae"]["run"]) => ({
  ...indexRegistry,
  cnae: { heavy: false, tables: [], run },
});

const stubRegistry = registryWith(() => offlineRun);

const stubConfig: LocalIndexConfig = {
  version: () => Effect.succeed(null),
  registry: stubRegistry,
  run: (entry, scope) => withOfflineSources(entry.run(scope)),
};

const failingConfig: LocalIndexConfig = {
  version: () => Effect.succeed(null),
  registry: registryWith(() => Effect.fail(IndexFailure.make({ text: "boom" }))),
  run: (entry, scope) => withOfflineSources(entry.run(scope)),
};

const aggregateConfig: LocalIndexConfig = {
  version: () => Effect.succeed(null),
  registry: registryWith(() => Effect.succeed([2, 3, 4])),
  run: (entry, scope) => withOfflineSources(entry.run(scope)),
};

const ok = Test.make({ providers: providers(stubConfig) });
const bad = Test.make({ providers: providers(failingConfig) });
const aggregate = Test.make({ providers: providers(aggregateConfig) });

describe("LocalIndex", () => {
  ok.test.provider("indexa a fonte offline e reporta a contagem", (stack) =>
    Effect.gen(function* () {
      const indexed = yield* deploy(stack, LocalIndex("cnae", { fonte: "cnae" }));

      expect(indexed.fonte).toEqual("cnae");
      expect(indexed.rows).toEqual(1);

      yield* destroy(stack);
    })
  );

  bad.test.provider("propaga a falha do pipeline como falha do reconcile", (stack) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(deploy(stack, LocalIndex("cnae", { fonte: "cnae" })));

      expect(failure._tag).toEqual("StackOperationError");
      expect(failure.op).toEqual("deploy");
      expect(failure.cause).toContain("boom");

      yield* destroyIgnored(stack);
    })
  );

  aggregate.test.provider("soma contagens quando o pipeline retorna varios numeros", (stack) =>
    Effect.gen(function* () {
      const indexed = yield* deploy(stack, LocalIndex("cnae", { fonte: "cnae" }));

      expect(indexed.rows).toEqual(9);

      yield* destroy(stack);
    })
  );
});
