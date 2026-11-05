import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { SenadoFederal, SenadoFederalLive } from "../../src/sources/senado/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const senadoresJson =
  '{"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":[' +
  '{"IdentificacaoParlamentar":{"CodigoParlamentar":"5672","NomeParlamentar":"Alan Rick","NomeCompletoParlamentar":"Alan Rick Miranda","SexoParlamentar":"Masculino","SiglaPartidoParlamentar":"REPUBLICANOS","UfParlamentar":"AC","EmailParlamentar":"alan@senado.leg.br"}},' +
  '{"IdentificacaoParlamentar":{"CodigoParlamentar":"1234","NomeParlamentar":"Maria Souza","SiglaPartidoParlamentar":"PT","UfParlamentar":"SP"}}' +
  "]}}}";

const ceapsCsv = Arr.join(
  [
    '"ULTIMA ATUALIZACAO";"16/06/2026 06:00:00"',
    '"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"',
    '"2025";"1";"ALAN RICK";"Aluguel de imoveis para escritorio politico";"66.970.229/0132-26";"CLARO NXT TELECOMUNICACOES S.A";"693736";"18/01/2025";"";"399,44";"2248419"',
    '"2025";"2";"MARIA SOUZA";"Passagens aereas";"00.000.000/0001-91";"AZUL LINHAS AEREAS S.A";"X1";"05/02/2025";"voo SP-DF";"1.250,50";"99887"',
  ],
  "\r\n"
);

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

const TestLayer = SenadoFederalLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "senado store + json/csv ingest",
  (it) => {
    it.effect("indexes senadores (JSON) and CEAPS (CSV, skips metadata line)", () =>
      Effect.gen(function* () {
        const senado = yield* SenadoFederal;
        const result = yield* senado.index;
        expect(result.senadores).toBe(2);
        expect(result.ceaps).toBe(2);
      })
    );
  }
);
