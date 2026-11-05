import { Layer } from "effect";
import * as Test from "@alchemy.run/test/Vitest";
import { describe, expect } from "@effect/vitest";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import {
  LocalDatabase,
  providers,
  schemaHash,
} from "../../infra/local-database";
import { BunServices } from "@effect/platform-bun";
import { deploy, planStack, destroy } from "./support/stack";

const withPlatform = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Layer.build(BunServices.layer).pipe(
    Effect.flatMap((context) => Effect.provideContext(effect, context)),
    Effect.scoped
  );

const { test } = Test.make({ providers });

const tempDataDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dataDir = yield* fs.makeTempDirectoryScoped({
    prefix: "alchemy-local-db-",
  });
  return { fs, dataDir };
});

const firstAction = (plan: {
  readonly resources: Record<string, { readonly action: string }>;
}) =>
  Option.map(Arr.head(Rec.values(plan.resources)), (node) => node.action);

describe("LocalDatabase", () => {
  test.provider("provisiona extensoes e tabelas no dataDir", (stack) =>
    withPlatform(
      Effect.gen(function* () {
        const { dataDir } = yield* tempDataDir;

        const created = yield* deploy(stack, LocalDatabase("local-db", { dataDir }));

        expect(created.dataDir).toEqual(dataDir);
        expect(created.tables).toBeGreaterThan(0);
        expect(created.extensions).toContain("vector");
        expect(created.schemaHash).toMatch(/^[0-9a-f]{64}$/);
        const expectedHash = yield* schemaHash;
        expect(created.schemaHash).toEqual(expectedHash);

        yield* destroy(stack);
      })
    )
  );

  test.provider("redeploy e no-op quando o schema nao mudou", (stack) =>
    withPlatform(
      Effect.gen(function* () {
        const { fs, dataDir } = yield* tempDataDir;

        const first = yield* deploy(stack, LocalDatabase("local-db", { dataDir }));
        const existsAfterDeploy = yield* fs.exists(dataDir);
        expect(existsAfterDeploy).toBe(true);

        const plan = yield* planStack(stack, LocalDatabase("local-db", { dataDir }));
        expect(firstAction(plan)).toEqual(Option.some("noop"));

        const second = yield* deploy(stack, LocalDatabase("local-db", { dataDir }));
        expect(second.schemaHash).toEqual(first.schemaHash);
        expect(second).toEqual(first);

        yield* destroy(stack);
      })
    )
  );

  test.provider("re-provisiona quando o dataDir foi removido do disco", (stack) =>
    withPlatform(
      Effect.gen(function* () {
        const { fs, dataDir } = yield* tempDataDir;

        yield* deploy(stack, LocalDatabase("local-db", { dataDir }));
        yield* fs.remove(dataDir, { recursive: true, force: true });
        const existsAfterRemove = yield* fs.exists(dataDir);
        expect(existsAfterRemove).toBe(false);

        const plan = yield* planStack(stack, LocalDatabase("local-db", { dataDir }));
        expect(firstAction(plan)).toEqual(Option.some("update"));

        yield* destroy(stack);
      })
    )
  );
});
