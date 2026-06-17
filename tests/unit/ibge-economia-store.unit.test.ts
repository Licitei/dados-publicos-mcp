import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  IbgeEconomia,
  IbgeEconomiaLive,
} from "../../src/sources/ibge-economia/store";

const serie = (id: string, nome: string, valor: string) => ({
  localidade: { id, nome, nivel: { id: "N6", nome: "Município" } },
  serie: { "2021": valor },
});

const populacao = [
  {
    id: "9324",
    variavel: "População residente estimada",
    unidade: "Pessoas",
    resultados: [
      {
        classificacoes: [],
        series: [
          serie("3550308", "São Paulo (SP)", "12396372"),
          serie("3509502", "Campinas (SP)", "1223237"),
        ],
      },
    ],
  },
];

const pib = [
  {
    id: "37",
    variavel: "Produto Interno Bruto a preços correntes",
    unidade: "Mil Reais",
    resultados: [
      {
        classificacoes: [],
        series: [
          serie("3550308", "São Paulo (SP)", "828980747"),
          serie("3509502", "Campinas (SP)", "84000000"),
        ],
      },
    ],
  },
];

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("/agregados/6579/")
    ? Response.json(populacao)
    : url.includes("/agregados/5938/")
      ? Response.json(pib)
      : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  IbgeEconomiaLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeEconomia;
  yield* ibge.index;
  return ibge;
});

describe("ibge-economia store + sidra ingest", () => {
  it.effect(
    "merges populacao and PIB by codigo IBGE",
    () =>
      Effect.gen(function* () {
        const ibge = yield* IbgeEconomia;
        const result = yield* ibge.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "economiaPorCodigo returns populacao, PIB and computed per-capita",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const rows = yield* ibge.economiaPorCodigo("3550308");
        expect(rows).toHaveLength(1);
        expect(rows[0].nome).toBe("São Paulo");
        expect(rows[0].uf).toBe("SP");
        expect(Number(rows[0].populacao)).toBe(12396372);
        expect(Number(rows[0].pibMilReais)).toBe(828980747);
        expect(Number(rows[0].pibPerCapita)).toBeGreaterThan(60000);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "rankingPib orders by PIB and honors the uf filter; trgm name search works",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const ranking = yield* ibge.rankingPib({ uf: "sp", limit: 10 });
        expect(ranking.map((r) => r.codIbge)).toEqual(["3550308", "3509502"]);
        const fuzzy = yield* ibge.buscarMunicipio("campina", 10);
        expect(fuzzy.map((r) => r.codIbge)).toContain("3509502");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
