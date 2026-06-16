import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  SenadoFederal,
  SenadoFederalLive,
} from "../../src/sources/senado/store";

const senadores = {
  ListaParlamentarEmExercicio: {
    Parlamentares: {
      Parlamentar: [
        {
          IdentificacaoParlamentar: {
            CodigoParlamentar: "5672",
            NomeParlamentar: "Alan Rick",
            NomeCompletoParlamentar: "Alan Rick Miranda",
            SexoParlamentar: "Masculino",
            SiglaPartidoParlamentar: "REPUBLICANOS",
            UfParlamentar: "AC",
            EmailParlamentar: "alan@senado.leg.br",
          },
        },
        {
          IdentificacaoParlamentar: {
            CodigoParlamentar: "1234",
            NomeParlamentar: "Maria Souza",
            SiglaPartidoParlamentar: "PT",
            UfParlamentar: "SP",
          },
        },
      ],
    },
  },
};

const ceapsCsv = [
  '"ULTIMA ATUALIZACAO";"16/06/2026 06:00:00"',
  '"ANO";"MES";"SENADOR";"TIPO_DESPESA";"CNPJ_CPF";"FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO";"COD_DOCUMENTO"',
  '"2025";"1";"ALAN RICK";"Aluguel de imoveis para escritorio politico";"66.970.229/0132-26";"CLARO NXT TELECOMUNICACOES S.A";"693736";"18/01/2025";"";"399,44";"2248419"',
  '"2025";"2";"MARIA SOUZA";"Passagens aereas";"00.000.000/0001-91";"AZUL LINHAS AEREAS S.A";"X1";"05/02/2025";"voo SP-DF";"1.250,50";"99887"',
].join("\r\n");

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("/senador/lista/atual")
    ? Response.json(senadores)
    : url.includes("despesa_ceaps_2025.csv")
      ? new Response(latin1(ceapsCsv))
      : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  SenadoFederalLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const senado = yield* SenadoFederal;
  yield* senado.index;
  return senado;
});

describe("senado store + json/csv ingest", () => {
  it.effect(
    "indexes senadores (JSON) and CEAPS (CSV, skips metadata line)",
    () =>
      Effect.gen(function* () {
        const senado = yield* SenadoFederal;
        const result = yield* senado.index;
        expect(result.senadores).toBe(2);
        expect(result.ceaps).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarSenador matches by fuzzy name; fornecedor CEAPS by bm25",
    () =>
      Effect.gen(function* () {
        const senado = yield* seeded;
        const sen = yield* senado.buscarSenador("alan rick");
        expect(sen[0].partido).toBe("REPUBLICANOS");
        expect(sen[0].uf).toBe("AC");
        const forn = yield* senado.buscarFornecedorCeaps("claro telecomunicacoes");
        expect(forn.map((r) => r.docNormalizado)).toContain("66970229013226");
        expect(Number(forn[0].score)).toBeLessThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
