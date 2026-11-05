import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { schemaDdl, schemaHash } from "../../infra/local-database";

const independentSha256 = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(
    Effect.map((buffer) =>
      Arr.join(
        Arr.map(Arr.fromIterable(new Uint8Array(buffer)), (byte) =>
          Str.padStart(2, "0")(byte.toString(16))
        ),
        ""
      )
    )
  );

describe("schemaHash", () => {
  it.effect("is a stable 64-hex digest", () =>
    Effect.gen(function* () {
      const first = yield* schemaHash;
      const second = yield* schemaHash;
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(first).toEqual(second);
    })
  );

  it.effect(
    "hashes the full rendered DDL, including index method/opclass/with",
    () =>
      Effect.sync(() => {
        const ddl = schemaDdl();
        expect(ddl).toContain("create table");
        expect(ddl).toContain("create index");
        expect(ddl).toContain("using bm25");
        expect(ddl).toContain("text_config");
        expect(ddl).toContain("vector_cosine_ops");
      })
  );

  it.effect("the digest is a function of the rendered DDL", () =>
    Effect.gen(function* () {
      const expected = yield* independentSha256(schemaDdl());
      const actual = yield* schemaHash;
      expect(actual).toEqual(expected);
    })
  );
});
