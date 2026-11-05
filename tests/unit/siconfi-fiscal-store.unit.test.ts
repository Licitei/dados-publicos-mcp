import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";
import { SiconfiFiscal, SiconfiFiscalLive } from "../../src/sources/siconfi-fiscal/store";

const dca =
  '{"items":[{"exercicio":2022,"instituicao":"Uniao","cod_ibge":0,"uf":"BR","anexo":"DCA-Anexo I-AB","rotulo":"Padrão","coluna":"31/12/2022","cod_conta":"P1.0.0.0.0.00.00","conta":"1.0.0.0.0.00.00 - Ativo","valor":161770212909.33},{"exercicio":2022,"instituicao":"Uniao","cod_ibge":0,"uf":"BR","anexo":"DCA-Anexo I-C","rotulo":"Padrão","coluna":"31/12/2022","cod_conta":"P2.0.0.0.0.00.00","conta":"2.0.0.0.0.00.00 - Passivo","valor":50000000000}],"hasMore":false}';

const rreo =
  '{"items":[{"exercicio":2022,"instituicao":"Uniao","uf":"BR","anexo":"RREO-Anexo 02","rotulo":"Total das Despesas","coluna":"DOTAÇÃO INICIAL","cod_conta":"RREO2TotalDespesas","conta":"DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS)","valor":77094860952}],"hasMore":false}';

const rgf =
  '{"items":[{"exercicio":2022,"instituicao":"Uniao","uf":"BR","anexo":"RGF-Anexo 01","rotulo":"Padrão","coluna":"<MR-11>","cod_conta":"DespesaComPessoalBruta","conta":"DESPESA BRUTA COM PESSOAL (I)","valor":2058773585.88}],"hasMore":false}';

const json = { "content-type": "application/json" };

const HttpFixture = fixtureLayer([
  { match: pathIncludes("/dca"), respond: { body: dca, headers: json } },
  { match: pathIncludes("/rreo"), respond: { body: rreo, headers: json } },
  { match: pathIncludes("/rgf"), respond: { body: rgf, headers: json } },
]);

const TestLayer = SiconfiFiscalLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

const seeded = Effect.gen(function* () {
  const siconfi = yield* SiconfiFiscal;
  yield* siconfi.index;
  return siconfi;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("siconfi-fiscal store + ords ingest", (it) => {
  it.effect("indexes DCA+RREO+RGF fact lines for the União", () =>
    Effect.gen(function* () {
      const siconfi = yield* SiconfiFiscal;
      const result = yield* siconfi.index;
      expect(result.inserted).toBe(4);
      expect(result.total).toBe(4);
    })
  );

  it.effect("indexarEnte replaces only that ente and exercise", () =>
    Effect.gen(function* () {
      const siconfi = yield* seeded;
      const again = yield* siconfi.indexarEnte("1", 2022);
      expect(again.inserted).toBe(4);
    })
  );
});
