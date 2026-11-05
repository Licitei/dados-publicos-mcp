import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import {
  IbgeEconomia,
  IbgeEconomiaLive,
} from "../../src/sources/ibge-economia/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";


const populacao = '[{"id":"9324","variavel":"População residente estimada","unidade":"Pessoas","resultados":[{"classificacoes":[],"series":[{"localidade":{"id":"3550308","nome":"São Paulo (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"12396372"}},{"localidade":{"id":"3509502","nome":"Campinas (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"1223237"}}]}]}]';

const pib = '[{"id":"37","variavel":"Produto Interno Bruto a preços correntes","unidade":"Mil Reais","resultados":[{"classificacoes":[],"series":[{"localidade":{"id":"3550308","nome":"São Paulo (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"828980747"}},{"localidade":{"id":"3509502","nome":"Campinas (SP)","nivel":{"id":"N6","nome":"Município"}},"serie":{"2021":"84000000"}}]}]}]';

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

const TestLayer = Layer.mergeAll(
  IbgeEconomiaLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeEconomia;
  yield* ibge.index;
  return ibge;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("ibge-economia store + sidra ingest", (it) => {
  it.effect("merges populacao and PIB by codigo IBGE", () =>
    Effect.gen(function* () {
      const ibge = yield* IbgeEconomia;
      const result = yield* ibge.index;
      expect(result.inserted).toBe(2);
      expect(result.total).toBe(2);
    }));

  it.effect("economiaPorCodigo returns populacao, PIB and computed per-capita", () =>
    Effect.gen(function* () {
      const ibge = yield* seeded;
      const rows = yield* ibge.economiaPorCodigo("3550308");
      expect(rows).toHaveLength(1);
      const first = Arr.head(rows);
      expect(Option.map(first, (r) => r.nome)).toEqual(Option.some("São Paulo"));
      expect(Option.map(first, (r) => r.uf)).toEqual(Option.some("SP"));
      expect(Option.map(first, (r) => Number(r.populacao))).toEqual(Option.some(12396372));
      expect(Option.map(first, (r) => Number(r.pibMilReais))).toEqual(Option.some(828980747));
      expect(Option.exists(first, (r) => Number(r.pibPerCapita) > 60000)).toBe(true);
    }));

  it.effect("rankingPib orders by PIB and honors the uf filter; trgm name search works", () =>
    Effect.gen(function* () {
      const ibge = yield* seeded;
      const ranking = yield* ibge.rankingPib({ uf: "sp", limit: 10 });
      expect(Arr.map(ranking, (r) => r.codIbge)).toEqual(["3550308", "3509502"]);
      const fuzzy = yield* ibge.buscarMunicipio("campina", 10);
      expect(Arr.map(fuzzy, (r) => r.codIbge)).toContain("3509502");
    }));
});
