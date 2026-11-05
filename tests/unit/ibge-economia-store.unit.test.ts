import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import { IbgeEconomia, IbgeEconomiaLive } from "../../src/sources/ibge-economia/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const populacao =
  '[{"id":"9324","variavel":"População residente estimada","unidade":"Pessoas","resultados":[{"classificacoes":[],"series":[{"localidade":{"id":"3550308","nome":"São Paulo (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"12396372"}},{"localidade":{"id":"3509502","nome":"Campinas (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"1223237"}}]}]}]';

const pib =
  '[{"id":"37","variavel":"Produto Interno Bruto a preços correntes","unidade":"Mil Reais","resultados":[{"classificacoes":[],"series":[{"localidade":{"id":"3550308","nome":"São Paulo (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"828980747"}},{"localidade":{"id":"3509502","nome":"Campinas (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"84000000"}}]}]}]';

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/agregados/6579/"),
    respond: { body: populacao, headers: { "content-type": "application/json" } },
  },
  {
    match: pathIncludes("/agregados/5938/"),
    respond: { body: pib, headers: { "content-type": "application/json" } },
  },
]);

const TestLayer = IbgeEconomiaLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(60) })("ibge-economia store + sidra ingest", (it) => {
  it.effect("merges populacao and PIB by codigo IBGE", () =>
    Effect.gen(function* () {
      const ibge = yield* IbgeEconomia;
      const result = yield* ibge.index;
      expect(result.inserted).toBe(2);
      expect(result.total).toBe(2);
    })
  );
});
