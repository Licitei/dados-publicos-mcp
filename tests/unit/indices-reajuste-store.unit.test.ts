import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { IndicesReajuste, IndicesReajusteLive } from "../../src/sources/indices-reajuste/store";
import { FixtureServer, fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const fixtures = fixtureLayer([
  {
    match: pathIncludes("/dados/serie/"),
    respond: (hit) => ({
      body:
        hit <= 2
          ? '[{"data":"01/01/2026","valor":"0.50"},{"data":"01/02/2026","valor":"-0.10"}]'
          : '[{"data":"01/01/2026","valor":""}]',
    }),
  },
  {
    match: pathIncludes("/values/"),
    respond: { body: '[{"V":"Valor","D3C":"Mês (Código)"},{"V":"7000.50","D3C":"202601"}]' },
  },
]);
const TestLayer = IndicesReajusteLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "official index fixtures over real TCP and DuckDB",
  (it) => {
    it.effect("indexes six SGS series and the SIDRA index as distinct monthly observations", () =>
      Effect.gen(function* () {
        const service = yield* IndicesReajuste;
        const duck = yield* Duck;
        const fuzzy = yield* Fuzzy;
        const server = yield* FixtureServer;
        const loaded = yield* service.index;
        expect(loaded).toBe(13);
        const rows = yield* duck.query(
          Schema.Struct({ codigo: Schema.String, tipo: Schema.String, valor: Schema.Finite }),
          "SELECT codigo, tipo, valor FROM indice_reajuste WHERE mes = '2026-01' ORDER BY codigo"
        );
        expect(rows).toHaveLength(7);
        expect(rows).toContainEqual({ codigo: "1737/2266", tipo: "numero_indice", valor: 7000.5 });
        expect(rows).toContainEqual({ codigo: "433", tipo: "taxa_mensal", valor: 0.5 });
        const matches = yield* fuzzy.match("indice_reajuste", "ipca");
        expect(Arr.isReadonlyArrayNonEmpty(matches)).toBe(true);
        const hits = yield* server.hits("/dados/serie/bcdata.sgs.433/dados");
        expect(hits).toBe(1);
        yield* service.index;
        const count = yield* duck.query(
          Schema.Struct({ n: Schema.Finite }),
          "SELECT count(*)::INTEGER AS n FROM indice_reajuste"
        );
        expect(count).toEqual([{ n: 13 }]);
        const rejected = yield* Effect.exit(service.index);
        expect(rejected._tag).toBe("Failure");
        const preserved = yield* duck.query(
          Schema.Struct({ n: Schema.Finite }),
          "SELECT count(*)::INTEGER AS n FROM indice_reajuste"
        );
        expect(preserved).toEqual([{ n: 13 }]);
      })
    );
  }
);
