import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  TcuInidoneos,
  TcuInidoneosLive,
} from "../../src/sources/tcu-inidoneos/store";

const licitantesCsv = [
  '"NOME"|"CPF_CNPJ"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"DATA FINAL"|"DATA ACORDAO"|"UF"|"MUNICIPIO"',
  '"A. P. B. J. CONSTRUCOES E SERVICOS LTDA"|"07.405.573/0001-44"|"007.720/2012-2"|"AC-002099/2015-PL"|"30/09/2021"|"30/09/2026"|"19/08/2015"|"DF"|""',
  '"BETA TERRAPLANAGEM LTDA"|"22.333.444/0001-55"|"010.000/2018-9"|"AC-001000/2019-PL"|"01/02/2020"|"01/02/2025"|"10/12/2019"|"SP"|"CAMPINAS"',
].join("\r\n");

const respContasCsv = [
  '"NOME"|"CPF_CNPJ"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"UF"|"MUNICIPIO"',
  '"A. P. B. J. CONSTRUCOES E SERVICOS LTDA"|"07405573000144"|"033.808/2019-8"|"https://contas.tcu.gov.br/x"|"04/09/2021"|"RJ"|"MARICA"',
].join("\r\n");

const inabilitadosCsv = [
  '"NOME"|"CPF"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"DATA FINAL"|"DATA ACORDAO"|"UF"|"MUNICIPIO"',
  '"ABDALA GOMES SANTOS"|"215.805.453-00"|"026.615/2020-7"|"AC-000738/2022-PL"|"16/07/2022"|"16/07/2027"|"06/04/2022"|"MA"|"SANTA INES"',
].join("\r\n");

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("licitantes-inidoneos.csv")
    ? new Response(licitantesCsv)
    : url.includes("resp-contas-julgadas-irregulares.csv")
      ? new Response(respContasCsv)
      : url.includes("inabilitados-funcao-publica.csv")
        ? new Response(inabilitadosCsv)
        : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  TcuInidoneosLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const tcu = yield* TcuInidoneos;
  yield* tcu.index;
  return tcu;
});

describe("tcu-inidoneos store + csv ingest", () => {
  it.effect(
    "indexes the three lists and counts every row",
    () =>
      Effect.gen(function* () {
        const tcu = yield* TcuInidoneos;
        const result = yield* tcu.index;
        expect(result.inserted).toBe(4);
        expect(result.total).toBe(4);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "verificar finds a CNPJ across lists, masked or unmasked, by normalized doc",
    () =>
      Effect.gen(function* () {
        const tcu = yield* seeded;
        const hit = yield* tcu.verificar("07.405.573/0001-44");
        expect(hit.docNormalizado).toBe("07405573000144");
        expect(hit.tipoDocumento).toBe("cnpj");
        expect(hit.inidoneo).toBe(true);
        expect(hit.total).toBe(2);
        expect(hit.porLista).toEqual({
          "licitantes-inidoneos": 1,
          "resp-contas-julgadas": 1,
        });
        const cpf = yield* tcu.verificar("215.805.453-00");
        expect(cpf.tipoDocumento).toBe("cpf");
        expect(cpf.porLista).toEqual({ "inabilitados-funcao-publica": 1 });
        const ausente = yield* tcu.verificar("00000000000000");
        expect(ausente.inidoneo).toBe(false);
        expect(ausente.total).toBe(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarPorNome matches by bm25 name, falls back to trgm on a typo",
    () =>
      Effect.gen(function* () {
        const tcu = yield* seeded;
        const hit = yield* tcu.buscarPorNome("construcoes servicos");
        expect(hit.map((r) => r.docNormalizado)).toContain("07405573000144");
        expect(Number(hit[0].score)).toBeLessThan(0);
        const typo = yield* tcu.buscarPorNome("terraplanagen");
        expect(typo.map((r) => r.docNormalizado)).toContain("22333444000155");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
