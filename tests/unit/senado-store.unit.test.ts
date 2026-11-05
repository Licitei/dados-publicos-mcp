import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import {
  SenadoFederal,
  SenadoFederalLive,
} from "../../src/sources/senado/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";

const senadoresJson =
  '{"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":[' +
  '{"IdentificacaoParlamentar":{"CodigoParlamentar":"5672","NomeParlamentar":"Alan Rick","NomeCompletoParlamentar":"Alan Rick Miranda","SexoParlamentar":"Masculino","SiglaPartidoParlamentar":"REPUBLICANOS","UfParlamentar":"AC","EmailParlamentar":"alan@senado.leg.br"}},' +
  '{"IdentificacaoParlamentar":{"CodigoParlamentar":"1234","NomeParlamentar":"Maria Souza","SiglaPartidoParlamentar":"PT","UfParlamentar":"SP"}}' +
  "]}}}";

const ceapsCsv = Arr.join([
  '"ULTIMA ATUALIZACAO";"16/06/2026 06:00:00"',
  '"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"',
  '"2025";"1";"ALAN RICK";"Aluguel de imoveis para escritorio politico";"66.970.229/0132-26";"CLARO NXT TELECOMUNICACOES S.A";"693736";"18/01/2025";"";"399,44";"2248419"',
  '"2025";"2";"MARIA SOUZA";"Passagens aereas";"00.000.000/0001-91";"AZUL LINHAS AEREAS S.A";"X1";"05/02/2025";"voo SP-DF";"1.250,50";"99887"',
], "\r\n");

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/senador/lista/atual"),
    respond: {
      body: senadoresJson,
      headers: { "content-type": "application/json" },
    },
  },
  { match: pathIncludes("despesa_ceaps_2025.csv"), respond: { body: ceapsCsv } },
]);

const TestLayer = Layer.mergeAll(
  SenadoFederalLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const senado = yield* SenadoFederal;
  yield* senado.index;
  return senado;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("senado store + json/csv ingest", (it) => {
  it.effect(
    "indexes senadores (JSON) and CEAPS (CSV, skips metadata line)",
    () =>
      Effect.gen(function* () {
        const senado = yield* SenadoFederal;
        const result = yield* senado.index;
        expect(result.senadores).toBe(2);
        expect(result.ceaps).toBe(2);
      }),
  );

  it.effect(
    "buscarSenador matches by fuzzy name; fornecedor CEAPS by bm25",
    () =>
      Effect.gen(function* () {
        const senado = yield* seeded;
        const sen = yield* senado.buscarSenador("alan rick");
        const first = Arr.head(sen);
        expect(Option.map(first, (r) => r.partido)).toEqual(
          Option.some("REPUBLICANOS")
        );
        expect(Option.map(first, (r) => r.uf)).toEqual(Option.some("AC"));
        const forn = yield* senado.buscarFornecedorCeaps("claro telecomunicacoes");
        expect(Arr.map(forn, (r) => r.docNormalizado)).toContain("66970229013226");
        expect(forn.length).toBeGreaterThan(0);
        expect(Arr.every(forn, (r) => Number(r.score) < 0)).toBe(true);
      }),
  );

  it.effect(
    "gastosPorFornecedor sums CEAPS reimbursements for a CNPJ",
    () =>
      Effect.gen(function* () {
        const senado = yield* seeded;
        const gastos = yield* senado.gastosPorFornecedor("66.970.229/0132-26");
        expect(gastos.docNormalizado).toBe("66970229013226");
        expect(gastos.count).toBe(1);
        expect(gastos.total).toBeCloseTo(399.44, 2);
        const azul = yield* senado.gastosPorFornecedor("00000000000191");
        expect(azul.total).toBeCloseTo(1250.5, 2);
      }),
  );
});
