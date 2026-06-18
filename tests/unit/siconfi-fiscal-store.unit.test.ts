import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { TestDbLive } from "./support/test-db";
import {
  SiconfiFiscal,
  SiconfiFiscalLive,
} from "../../src/sources/siconfi-fiscal/store";

const dca = {
  items: [
    {
      exercicio: 2022,
      instituicao: "Uniao",
      cod_ibge: 0,
      uf: "BR",
      anexo: "DCA-Anexo I-AB",
      rotulo: "Padrão",
      coluna: "31/12/2022",
      cod_conta: "P1.0.0.0.0.00.00",
      conta: "1.0.0.0.0.00.00 - Ativo",
      valor: 161770212909.33,
    },
    {
      exercicio: 2022,
      instituicao: "Uniao",
      cod_ibge: 0,
      uf: "BR",
      anexo: "DCA-Anexo I-C",
      rotulo: "Padrão",
      coluna: "31/12/2022",
      cod_conta: "P2.0.0.0.0.00.00",
      conta: "2.0.0.0.0.00.00 - Passivo",
      valor: 50000000000,
    },
  ],
  hasMore: false,
};

const rreo = {
  items: [
    {
      exercicio: 2022,
      instituicao: "Uniao",
      uf: "BR",
      anexo: "RREO-Anexo 02",
      rotulo: "Total das Despesas",
      coluna: "DOTAÇÃO INICIAL",
      cod_conta: "RREO2TotalDespesas",
      conta: "DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS)",
      valor: 77094860952,
    },
  ],
  hasMore: false,
};

const rgf = {
  items: [
    {
      exercicio: 2022,
      instituicao: "Uniao",
      uf: "BR",
      anexo: "RGF-Anexo 01",
      rotulo: "Padrão",
      coluna: "<MR-11>",
      cod_conta: "DespesaComPessoalBruta",
      conta: "DESPESA BRUTA COM PESSOAL (I)",
      valor: 2058773585.88,
    },
  ],
  hasMore: false,
};

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("/dca?")
    ? Response.json(dca)
    : url.includes("/rreo?")
      ? Response.json(rreo)
      : url.includes("/rgf?")
        ? Response.json(rgf)
        : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  SiconfiFiscalLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpStub))),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const siconfi = yield* SiconfiFiscal;
  yield* siconfi.index;
  return siconfi;
});

describe("siconfi-fiscal store + ords ingest", () => {
  it.effect(
    "indexes DCA+RREO+RGF fact lines for the União",
    () =>
      Effect.gen(function* () {
        const siconfi = yield* SiconfiFiscal;
        const result = yield* siconfi.index;
        expect(result.inserted).toBe(4);
        expect(result.total).toBe(4);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "fiscalPorEnte filters by demonstrativo and preserves big values",
    () =>
      Effect.gen(function* () {
        const siconfi = yield* seeded;
        const all = yield* siconfi.fiscalPorEnte("1");
        expect(all).toHaveLength(4);
        const dcaRows = yield* siconfi.fiscalPorEnte("1", {
          demonstrativo: "DCA",
        });
        expect(dcaRows).toHaveLength(2);
        const ativo = dcaRows.find((r) => r.codConta === "P1.0.0.0.0.00.00");
        expect(Number(ativo?.valor)).toBe(161770212909.33);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarConta finds fiscal lines by free text (bm25)",
    () =>
      Effect.gen(function* () {
        const siconfi = yield* seeded;
        const pessoal = yield* siconfi.buscarConta("despesa bruta pessoal");
        expect(pessoal.map((r) => r.codConta)).toContain(
          "DespesaComPessoalBruta"
        );
        expect(Number(pessoal[0].score)).toBeLessThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
