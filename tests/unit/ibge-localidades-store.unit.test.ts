import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db, DbLayer } from "../../src/kernel/db/client";
import {
  IbgeLocalidades,
  IbgeLocalidadesLive,
} from "../../src/sources/ibge-localidades/store";

const uf = (sigla: string, id: number, nome: string) => ({
  id,
  sigla,
  nome,
  regiao: { id: 5, sigla: sigla === "SP" ? "SE" : "CO", nome: "Regiao" },
});

const withMicro = (
  id: number,
  nome: string,
  ufObj: ReturnType<typeof uf>,
  mesoId: number,
  mesoNome: string
) => ({
  id,
  nome,
  microrregiao: {
    id: mesoId * 10,
    nome: `${mesoNome} micro`,
    mesorregiao: { id: mesoId, nome: mesoNome, UF: ufObj },
  },
});

const SP = uf("SP", 35, "Sao Paulo");
const GO = uf("GO", 52, "Goias");

const municipiosFixture = [
  withMicro(3550308, "São Paulo", SP, 3515, "Metropolitana de São Paulo"),
  withMicro(3509502, "Campinas", SP, 3520, "Campinas"),
  withMicro(3548708, "Santos", SP, 3516, "Macro Metropolitana Paulista"),
  withMicro(5208707, "Goiânia", GO, 5203, "Centro Goiano"),
  withMicro(5201405, "Anápolis", GO, 5203, "Centro Goiano"),
  {
    id: 5101837,
    nome: "Pescaria Brava",
    microrregiao: null,
    "regiao-imediata": {
      id: 520005,
      nome: "Imediata",
      "regiao-intermediaria": { id: 5201, nome: "Intermediaria", UF: GO },
    },
  },
];

const route = async (input: string | URL | Request): Promise<Response> => {
  const path = new URL(String(input)).pathname;
  return path.endsWith("/municipios")
    ? Response.json(municipiosFixture)
    : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  IbgeLocalidadesLive.pipe(Layer.provide(DbLayer)),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
  return ibge;
});

describe("ibge-localidades store + fuzzy resolver", () => {
  it.effect(
    "index loads the fixture across both UFs including the null-microrregiao edge case",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const edge = yield* ibge.municipioByCodigo("5101837");
        expect(edge.nome).toBe("Pescaria Brava");
        expect(edge.uf).toBe("GO");
        expect(edge.mesorregiao).toBeNull();
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "fuzzy resolve is accent and typo tolerant",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const accentless = yield* ibge.resolveMunicipio("sao paulo");
        expect(accentless[0].nome).toBe("São Paulo");
        const abbreviated = yield* ibge.resolveMunicipio("S Paulo");
        expect(abbreviated[0].nome).toBe("São Paulo");
        const goiania = yield* ibge.resolveMunicipio("goiania");
        expect(goiania[0].nome).toBe("Goiânia");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "the uf filter narrows the candidate pool",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const inGo = yield* ibge.resolveMunicipio("campinas", { uf: "GO" });
        for (const row of inGo) {
          expect(row.uf).toBe("GO");
        }
        const inSp = yield* ibge.resolveMunicipio("campinas", { uf: "SP" });
        expect(inSp[0].nome).toBe("Campinas");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "trgm ranking orders the best match first",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const rows = yield* ibge.resolveMunicipio("goiania");
        expect(rows[0].nome).toBe("Goiânia");
        const scores = rows.map((row) => Number(row.score));
        expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "resolveMunicipio fails MUNICIPIO_NOT_FOUND on an empty table",
    () =>
      Effect.gen(function* () {
        const ibge = yield* IbgeLocalidades;
        const error = yield* Effect.flip(ibge.resolveMunicipio("qualquer"));
        expect(error._tag).toBe("IbgeError");
        expect(error).toMatchObject({ code: "ibge.MUNICIPIO_NOT_FOUND" });
        expect(error.message).toContain("Municipio nao encontrado");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "validateUf accepts SP and rejects XX",
    () =>
      Effect.gen(function* () {
        const ibge = yield* IbgeLocalidades;
        const sp = yield* ibge.validateUf("sp");
        expect(sp.sigla).toBe("SP");
        expect(sp.id).toBe(35);
        const error = yield* Effect.flip(ibge.validateUf("XX"));
        expect(error.code).toBe("ibge.UF_INVALID");
        expect(error.message).toContain("UF invalida: XX");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "municipioByCodigo finds a known code and fails CODE_NOT_FOUND otherwise",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const found = yield* ibge.municipioByCodigo("3550308");
        expect(found.nome).toBe("São Paulo");
        const error = yield* Effect.flip(ibge.municipioByCodigo("9999999"));
        expect(error).toMatchObject({ code: "ibge.CODE_NOT_FOUND" });
        expect(error.message).toContain("Codigo IBGE nao encontrado");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "listByUf returns the municipios of a UF ordered by normalized name",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const result = yield* ibge.listByUf("sp");
        expect(result.uf).toBe("SP");
        expect(result.ufId).toBe(35);
        expect(result.total).toBe(3);
        const names = result.municipios.map((m) => m.nome);
        expect(names).toEqual(["Campinas", "Santos", "São Paulo"]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "index persists rows queryable via the raw Db handle",
    () =>
      Effect.gen(function* () {
        yield* seeded;
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select count(*)::int as count from municipio`
        );
        expect(Number(rows[0].count)).toBe(6);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );
});
