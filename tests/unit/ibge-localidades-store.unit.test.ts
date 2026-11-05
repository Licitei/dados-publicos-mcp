import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { sql } from "drizzle-orm";
import { Db } from "../../src/kernel/db/client";
import {
  IbgeLocalidades,
  IbgeLocalidadesLive,
} from "../../src/sources/ibge-localidades/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";

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

const municipiosRows = [
  withMicro(3550308, "São Paulo", SP, 3515, "Metropolitana de São Paulo"),
  withMicro(3509502, "Campinas", SP, 3520, "Campinas"),
  withMicro(3548708, "Santos", SP, 3516, "Macro Metropolitana Paulista"),
  withMicro(5208707, "Goiânia", GO, 5203, "Centro Goiano"),
  withMicro(5201405, "Anápolis", GO, 5203, "Centro Goiano"),
];

const quote = (value: string) => `"${value}"`;

const ufJson = (u: ReturnType<typeof uf>) =>
  `{"id":${u.id},"sigla":${quote(u.sigla)},"nome":${quote(u.nome)},"regiao":{"id":${u.regiao.id},"sigla":${quote(u.regiao.sigla)},"nome":${quote(u.regiao.nome)}}}`;

const microJson = (row: ReturnType<typeof withMicro>) =>
  `{"id":${row.id},"nome":${quote(row.nome)},"microrregiao":{"id":${row.microrregiao.id},"nome":${quote(row.microrregiao.nome)},"mesorregiao":{"id":${row.microrregiao.mesorregiao.id},"nome":${quote(row.microrregiao.mesorregiao.nome)},"UF":${ufJson(row.microrregiao.mesorregiao.UF)}}}}`;

const edgeJson = `{"id":5101837,"nome":"Pescaria Brava","microrregiao":null,"regiao-imediata":{"id":520005,"nome":"Imediata","regiao-intermediaria":{"id":5201,"nome":"Intermediaria","UF":${ufJson(GO)}}}}`;

const municipiosBody = `[${Arr.join(
  Arr.append(Arr.map(municipiosRows, microJson), edgeJson),
  ","
)}]`;

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/municipios"),
    respond: {
      body: municipiosBody,
      headers: { "content-type": "application/json" },
    },
  },
]);

const TestLayer = Layer.mergeAll(
  IbgeLocalidadesLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))
  ),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
  return ibge;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("ibge-localidades empty table", (it) => {
  it.effect(
    "resolveMunicipio fails MUNICIPIO_NOT_FOUND on an empty table",
    () =>
      Effect.gen(function* () {
        const ibge = yield* IbgeLocalidades;
        const error = yield* Effect.flip(ibge.resolveMunicipio("qualquer"));
        expect(error._tag).toBe("IbgeError");
        expect(error).toMatchObject({ code: "ibge.MUNICIPIO_NOT_FOUND" });
        expect(error.message).toContain("Municipio nao encontrado");
      }),
  );
});

layer(TestLayer, { timeout: Duration.seconds(60) })("ibge-localidades store + fuzzy resolver", (it) => {
  it.effect(
    "index loads the fixture across both UFs including the null-microrregiao edge case",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const edge = yield* ibge.municipioByCodigo("5101837");
        expect(edge.nome).toBe("Pescaria Brava");
        expect(edge.ufSigla).toBe("GO");
        expect(edge.mesorregiaoNome).toBeNull();
      }),
  );

  it.effect(
    "fuzzy resolve is accent and typo tolerant",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const accentless = yield* ibge.resolveMunicipio("sao paulo");
        expect(Option.map(Arr.head(accentless), (r) => r.nome)).toEqual(Option.some("São Paulo"));
        const abbreviated = yield* ibge.resolveMunicipio("S Paulo");
        expect(Option.map(Arr.head(abbreviated), (r) => r.nome)).toEqual(Option.some("São Paulo"));
        const goiania = yield* ibge.resolveMunicipio("goiania");
        expect(Option.map(Arr.head(goiania), (r) => r.nome)).toEqual(Option.some("Goiânia"));
      }),
  );

  it.effect(
    "the uf filter narrows the candidate pool",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const inGo = yield* ibge.resolveMunicipio("campinas", { uf: "GO" });
        for (const row of inGo) {
          expect(row.ufSigla).toBe("GO");
        }
        const inSp = yield* ibge.resolveMunicipio("campinas", { uf: "SP" });
        expect(Option.map(Arr.head(inSp), (r) => r.nome)).toEqual(Option.some("Campinas"));
      }),
  );

  it.effect(
    "trgm ranking orders the best match first",
    () =>
      Effect.gen(function* () {
        const ibge = yield* seeded;
        const rows = yield* ibge.resolveMunicipio("goiania");
        expect(Option.map(Arr.head(rows), (r) => r.nome)).toEqual(Option.some("Goiânia"));
        const scores = Arr.map(rows, (row) => Number(row.score));
        expect(
          Option.zipWith(Arr.head(scores), Arr.last(scores), (top, bottom) => top >= bottom)
        ).toEqual(Option.some(true));
        expect(Arr.map(rows, (row) => row.nome)).not.toContain("Santos");
      }),
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
      }),
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
      }),
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
        const names = Arr.map(result.municipios, (m) => m.nome);
        expect(names).toEqual(["Campinas", "Santos", "São Paulo"]);
      }),
  );

  it.effect(
    "index persists rows queryable via the raw Db handle",
    () =>
      Effect.gen(function* () {
        yield* seeded;
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select count(*)::int as count from municipio`
        ).pipe(Effect.map(({ rows }) => rows));
        expect(Option.map(Arr.head(rows), (r) => Number(r.count))).toEqual(
          Option.some(6)
        );
      }),
  );
});
