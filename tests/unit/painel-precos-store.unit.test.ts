import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  PainelPrecos,
  PainelPrecosLive,
} from "../../src/sources/painel-precos/store";
import { TestDbLive } from "./support/test-db";

const record = (
  idItemCompra: number,
  precoUnitario: number,
  estado: string
) => ({
  idCompra: 98788905900312026,
  idItemCompra,
  codigoItemCatalogo: 99830,
  descricaoItem: "ARMA DE FOGO REVOLVER CALIBRE 38",
  precoUnitario,
  quantidade: 24.0,
  siglaUnidadeFornecimento: "UN",
  niFornecedor: 36725326000123,
  nomeFornecedor: "SAO MIGUEL CACA E PESCA LTDA",
  marca: "TS9",
  dataCompra: "2026-05-27",
  estado,
  codigoMunicipio: 4125704,
  municipio: "CURITIBA",
  codigoUasg: 987889,
  nomeOrgao: "POLICIA MILITAR",
  codigoClasse: 1005,
  nomeClasse: "ARMAS DE FOGO DE CALIBRE ATE 120MM",
});

const payload = {
  resultado: [record(11621646, 5100.0, "PR"), record(11621647, 4800.0, "SP")],
  totalRegistros: 2,
  totalPaginas: 1,
};

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("1_consultarMaterial")
    ? Response.json(payload)
    : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  PainelPrecosLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpStub))),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const painel = yield* PainelPrecos;
  yield* painel.indexItens(["99830"]);
  return painel;
});

describe("painel-precos store + price api harvest", () => {
  it.effect(
    "harvests price records for a CATMAT code and dedups by idItemCompra",
    () =>
      Effect.gen(function* () {
        const painel = yield* PainelPrecos;
        const result = yield* painel.indexItens(["99830"]);
        expect(result.inserted).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "estatisticaPreco computes n/min/median/max; uf filter narrows samples",
    () =>
      Effect.gen(function* () {
        const painel = yield* seeded;
        const stats = yield* painel.estatisticaPreco("99830");
        expect(stats.n).toBe(2);
        expect(Number(stats.minimo)).toBeCloseTo(4800, 0);
        expect(Number(stats.maximo)).toBeCloseTo(5100, 0);
        expect(Number(stats.mediana)).toBeCloseTo(4950, 0);
        const pr = yield* painel.precoPorItem("99830", { uf: "PR" });
        expect(pr).toHaveLength(1);
        expect(pr[0].estado).toBe("PR");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarPrecoPorDescricao matches item descriptions by bm25",
    () =>
      Effect.gen(function* () {
        const painel = yield* seeded;
        const hits = yield* painel.buscarPrecoPorDescricao("arma fogo revolver");
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].codigoItemCatalogo).toBe("99830");
        expect(Number(hits[0].score)).toBeLessThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
