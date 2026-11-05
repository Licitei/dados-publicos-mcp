import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";
import {
  SiconfiFiscal,
  SiconfiFiscalLive,
} from "../../src/sources/siconfi-fiscal/store";

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

const TestLayer = Layer.mergeAll(
  SiconfiFiscalLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
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

  it.effect("fiscalPorEnte filters by demonstrativo and preserves big values", () =>
    Effect.gen(function* () {
      const siconfi = yield* seeded;
      const all = yield* siconfi.fiscalPorEnte("1");
      expect(all).toHaveLength(4);
      const dcaRows = yield* siconfi.fiscalPorEnte("1", {
        demonstrativo: "DCA",
      });
      expect(dcaRows).toHaveLength(2);
      const ativo = Arr.findFirst(
        dcaRows,
        (r) => r.codConta === "P1.0.0.0.0.00.00"
      );
      expect(Option.map(ativo, (r) => Number(r.valor))).toEqual(
        Option.some(161770212909.33)
      );
    })
  );

  it.effect("buscarConta finds fiscal lines by free text (bm25)", () =>
    Effect.gen(function* () {
      const siconfi = yield* seeded;
      const pessoal = yield* siconfi.buscarConta("despesa bruta pessoal");
      expect(Arr.map(pessoal, (r) => r.codConta)).toContain(
        "DespesaComPessoalBruta"
      );
      expect(Option.map(Arr.head(pessoal), (r) => Number(r.score) < 0)).toEqual(
        Option.some(true)
      );
    })
  );
});
