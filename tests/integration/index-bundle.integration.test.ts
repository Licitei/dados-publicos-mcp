import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "@effect/vitest";
import { IndexBundle, providers } from "../../infra/index-bundle";

const { test } = Test.make({ providers: providers() });

describe("IndexBundle", () => {
  test.provider(
    "copia o dataDir para o destino e remove no destroy",
    (stack) =>
      Effect.gen(function* () {
        const src = mkdtempSync(join(tmpdir(), "index-bundle-src-"));
        const dest = join(
          mkdtempSync(join(tmpdir(), "index-bundle-out-")),
          "bundle"
        );
        writeFileSync(join(src, "data.bin"), "indice-prebuilt");

        const created = yield* IndexBundle("bundle", { src, dest }).pipe(
          stack.deploy
        );

        expect(created.dest).toEqual(dest);
        expect(created.files).toEqual(1);
        expect(created.bytes).toBeGreaterThan(0);
        expect(existsSync(join(dest, "data.bin"))).toBe(true);
        expect(readFileSync(join(dest, "data.bin"), "utf8")).toEqual(
          "indice-prebuilt"
        );

        yield* stack.destroy();

        expect(existsSync(dest)).toBe(false);
      })
  );

  test.provider("re-empacota refletindo o conteudo atual do src", (stack) =>
    Effect.gen(function* () {
      const src = mkdtempSync(join(tmpdir(), "index-bundle-src-"));
      const dest = join(
        mkdtempSync(join(tmpdir(), "index-bundle-out-")),
        "bundle"
      );

      writeFileSync(join(src, "data.bin"), "v1");
      yield* IndexBundle("bundle", { src, dest }).pipe(stack.deploy);
      expect(readFileSync(join(dest, "data.bin"), "utf8")).toEqual("v1");

      writeFileSync(join(src, "data.bin"), "v2-mais-dados");
      const updated = yield* IndexBundle("bundle", { src, dest }).pipe(
        stack.deploy
      );
      expect(readFileSync(join(dest, "data.bin"), "utf8")).toEqual(
        "v2-mais-dados"
      );
      expect(updated.bytes).toBeGreaterThan("v1".length);

      yield* stack.destroy();
    })
  );
});
