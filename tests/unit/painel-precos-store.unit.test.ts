import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import {
  PainelPrecos,
  PainelPrecosLive,
} from "../../src/sources/painel-precos/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";

const payload = '{"resultado":[{"idCompra":98788905900312026,"idItemCompra":11621646,"codigoItemCatalogo":99830,"descricaoItem":"ARMA DE FOGO REVOLVER CALIBRE 38","precoUnitario":5100.0,"quantidade":24.0,"siglaUnidadeFornecimento":"UN","niFornecedor":36725326000123,"nomeFornecedor":"SAO MIGUEL CACA E PESCA LTDA","marca":"TS9","dataCompra":"2026-05-27","estado":"PR","codigoMunicipio":4125704,"municipio":"CURITIBA","codigoUasg":987889,"nomeOrgao":"POLICIA MILITAR","codigoClasse":1005,"nomeClasse":"ARMAS DE FOGO DE CALIBRE ATE 120MM"},{"idCompra":98788905900312026,"idItemCompra":11621647,"codigoItemCatalogo":99830,"descricaoItem":"ARMA DE FOGO REVOLVER CALIBRE 38","precoUnitario":4800.0,"quantidade":24.0,"siglaUnidadeFornecimento":"UN","niFornecedor":36725326000123,"nomeFornecedor":"SAO MIGUEL CACA E PESCA LTDA","marca":"TS9","dataCompra":"2026-05-27","estado":"SP","codigoMunicipio":4125704,"municipio":"CURITIBA","codigoUasg":987889,"nomeOrgao":"POLICIA MILITAR","codigoClasse":1005,"nomeClasse":"ARMAS DE FOGO DE CALIBRE ATE 120MM"}],"totalRegistros":2,"totalPaginas":1}';

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("1_consultarMaterial"),
    respond: { body: payload, headers: { "content-type": "application/json" } },
  },
]);

const TestLayer = Layer.mergeAll(
  PainelPrecosLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

layer(TestLayer, { timeout: Duration.seconds(60) })("painel-precos store + price api harvest", (it) => {
  it.effect("harvests price records for a CATMAT code and dedups by idItemCompra", () =>
    Effect.gen(function* () {
      const painel = yield* PainelPrecos;
      const result = yield* painel.indexItens(["99830"]);
      expect(result.inserted).toBe(2);
    }));

  it.effect("estatisticaPreco computes n/min/median/max; uf filter narrows samples", () =>
    Effect.gen(function* () {
      const painel = yield* PainelPrecos;
      const stats = yield* painel.estatisticaPreco("99830");
      expect(stats.n).toBe(2);
      expect(Number(stats.minimo)).toBeCloseTo(4800, 0);
      expect(Number(stats.maximo)).toBeCloseTo(5100, 0);
      expect(Number(stats.mediana)).toBeCloseTo(4950, 0);
      const pr = yield* painel.precoPorItem("99830", { uf: "PR" });
      expect(pr).toHaveLength(1);
      expect(Option.map(Arr.head(pr), (r) => r.estado)).toEqual(Option.some("PR"));
    }));

  it.effect("buscarPrecoPorDescricao matches item descriptions by bm25", () =>
    Effect.gen(function* () {
      const painel = yield* PainelPrecos;
      const hits = yield* painel.buscarPrecoPorDescricao("arma fogo revolver");
      expect(hits.length).toBeGreaterThan(0);
      const first = Arr.head(hits);
      expect(Option.map(first, (r) => r.codigoItemCatalogo)).toEqual(Option.some("99830"));
      expect(Option.exists(first, (r) => Number(r.score) < 0)).toBe(true);
    }));
});
