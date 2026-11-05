import { Layer } from "effect";
import * as Test from "@alchemy.run/test/Vitest";
import { describe, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { IndexBundle, providers } from "../../infra/index-bundle";
import { BunServices } from "@effect/platform-bun";
import { deploy, destroy } from "./support/stack";

const withPlatform = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Layer.build(BunServices.layer).pipe(
    Effect.flatMap((context) => Effect.provideContext(effect, context)),
    Effect.scoped
  );

const { test } = Test.make({ providers });

const workspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = yield* fs.makeTempDirectoryScoped({ prefix: "index-bundle-src-" });
  const out = yield* fs.makeTempDirectoryScoped({ prefix: "index-bundle-out-" });
  return { fs, src, dest: path.join(out, "bundle"), file: path.join(src, "data.bin"), path };
});

describe("IndexBundle", () => {
  test.provider("copia o dataDir para o destino e remove no destroy", (stack) =>
    withPlatform(
      Effect.gen(function* () {
        const { fs, path, src, dest, file } = yield* workspace;
        yield* fs.writeFileString(file, "indice-prebuilt");

        const created = yield* deploy(stack, IndexBundle("bundle", { src, dest }));

        expect(created.dest).toEqual(dest);
        expect(created.files).toEqual(1);
        expect(created.bytes).toBeGreaterThan(0);
        const copied = path.join(dest, "data.bin");
        const present = yield* fs.exists(copied);
        const content = yield* fs.readFileString(copied);
        expect(present).toBe(true);
        expect(content).toEqual("indice-prebuilt");

        yield* destroy(stack);

        const remaining = yield* fs.exists(dest);
        expect(remaining).toBe(false);
      })
    )
  );

  test.provider("re-empacota refletindo o conteudo atual do src", (stack) =>
    withPlatform(
      Effect.gen(function* () {
        const { fs, path, src, dest, file } = yield* workspace;
        const bundled = path.join(dest, "data.bin");

        yield* fs.writeFileString(file, "v1");
        yield* deploy(stack, IndexBundle("bundle", { src, dest }));
        const first = yield* fs.readFileString(bundled);
        expect(first).toEqual("v1");

        yield* fs.writeFileString(file, "v2-mais-dados");
        const updated = yield* deploy(stack, IndexBundle("bundle", { src, dest }));
        const second = yield* fs.readFileString(bundled);
        expect(second).toEqual("v2-mais-dados");
        expect(updated.bytes).toBeGreaterThan("v1".length);

        yield* destroy(stack);
      })
    )
  );
});
