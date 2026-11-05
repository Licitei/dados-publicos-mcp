import { describe, expect, layer } from "@effect/vitest";
import { Duration, Effect } from "effect";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { TestFuzzyLive } from "./support/test-fuzzy";

describe("Fuzzy", () => {
  layer(TestFuzzyLive, { timeout: Duration.seconds(30), excludeTestServices: true })(
    "real fff fuzzy grep",
    (it) => {
      it.effect("recovers typos that FTS5 trigram misses", () =>
        Effect.gen(function* () {
          const fuzzy = yield* Fuzzy;
          yield* fuzzy.write("municipio", [
            ["5208707", "goiania go"],
            ["3550308", "sao paulo sp"],
            ["3509502", "campinas sp"],
          ]);
          const goiania = yield* fuzzy.match("municipio", "goina");
          const campinas = yield* fuzzy.match("municipio", "campnas");
          expect(goiania).toContain("5208707");
          expect(campinas).toContain("3509502");
        })
      );

      it.effect("a rewrite replaces the index and evicts the cached finder", () =>
        Effect.gen(function* () {
          const fuzzy = yield* Fuzzy;
          yield* fuzzy.write("fornecedor", [["1", "quantum tecnologia ltda"]]);
          const before = yield* fuzzy.match("fornecedor", "quantun");
          yield* fuzzy.write("fornecedor", [["2", "limpeza predial conservacao"]]);
          const stale = yield* fuzzy.match("fornecedor", "quantun");
          const fresh = yield* fuzzy.match("fornecedor", "limpza");
          expect(before).toEqual(["1"]);
          expect(stale).toEqual([]);
          expect(fresh).toEqual(["2"]);
        })
      );

      it.effect("an index that was never written yields no ids", () =>
        Effect.gen(function* () {
          const fuzzy = yield* Fuzzy;
          const ids = yield* fuzzy.match("inexistente", "qualquer");
          expect(ids).toEqual([]);
        })
      );

      it.effect("tabs and newlines in text cannot corrupt the id column", () =>
        Effect.gen(function* () {
          const fuzzy = yield* Fuzzy;
          yield* fuzzy.write("sujo", [["7", "linha\tcom\ntab e quebra"]]);
          const ids = yield* fuzzy.match("sujo", "quebra");
          expect(ids).toEqual(["7"]);
        })
      );
    }
  );
});
