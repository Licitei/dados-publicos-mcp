import { TestFuzzyLive } from "./support/test-fuzzy";
import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import { PainelPrecos, PainelPrecosLive } from "../../src/sources/painel-precos/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";

const payload =
  '{"resultado":[{"idCompra":98788905900312026,"idItemCompra":11621646,"codigoItemCatalogo":99830,"descricaoItem":"ARMA DE FOGO REVOLVER CALIBRE 38","precoUnitario":5100.0,"quantidade":24.0,"siglaUnidadeFornecimento":"UN","niFornecedor":36725326000123,"nomeFornecedor":"SAO MIGUEL CACA E PESCA LTDA","marca":"TS9","dataCompra":"2026-05-27","estado":"PR","codigoMunicipio":4125704,"municipio":"CURITIBA","codigoUasg":987889,"nomeOrgao":"POLICIA MILITAR","codigoClasse":1005,"nomeClasse":"ARMAS DE FOGO DE CALIBRE ATE 120MM"},{"idCompra":98788905900312026,"idItemCompra":11621647,"codigoItemCatalogo":99830,"descricaoItem":"ARMA DE FOGO REVOLVER CALIBRE 38","precoUnitario":4800.0,"quantidade":24.0,"siglaUnidadeFornecimento":"UN","niFornecedor":36725326000123,"nomeFornecedor":"SAO MIGUEL CACA E PESCA LTDA","marca":"TS9","dataCompra":"2026-05-27","estado":"SP","codigoMunicipio":4125704,"municipio":"CURITIBA","codigoUasg":987889,"nomeOrgao":"POLICIA MILITAR","codigoClasse":1005,"nomeClasse":"ARMAS DE FOGO DE CALIBRE ATE 120MM"}],"totalRegistros":2,"totalPaginas":1}';

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("1_consultarMaterial"),
    respond: { body: payload, headers: { "content-type": "application/json" } },
  },
]);

const TestLayer = PainelPrecosLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "painel-precos store + price api harvest",
  (it) => {
    it.effect("harvests price records for a CATMAT code and dedups by idItemCompra", () =>
      Effect.gen(function* () {
        const painel = yield* PainelPrecos;
        const result = yield* painel.indexItens(["99830"]);
        expect(result.inserted).toBe(2);
      })
    );
  }
);
