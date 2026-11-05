import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import {
  TcuInidoneos,
  TcuInidoneosLive,
} from "../../src/sources/tcu-inidoneos/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";

const licitantesCsv = Arr.join(
  [
  '"NOME"|"CPF_CNPJ"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"DATA FINAL"|"DATA ACORDAO"|"UF"|"MUNICIPIO"',
  '"A. P. B. J. CONSTRUCOES E SERVICOS LTDA"|"07.405.573/0001-44"|"007.720/2012-2"|"AC-002099/2015-PL"|"30/09/2021"|"30/09/2026"|"19/08/2015"|"DF"|""',
  '"BETA TERRAPLANAGEM LTDA"|"22.333.444/0001-55"|"010.000/2018-9"|"AC-001000/2019-PL"|"01/02/2020"|"01/02/2025"|"10/12/2019"|"SP"|"CAMPINAS"',
  ],
  "\r\n"
);

const respContasCsv = Arr.join(
  [
  '"NOME"|"CPF_CNPJ"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"UF"|"MUNICIPIO"',
  '"A. P. B. J. CONSTRUCOES E SERVICOS LTDA"|"07405573000144"|"033.808/2019-8"|"https://contas.tcu.gov.br/x"|"04/09/2021"|"RJ"|"MARICA"',
  ],
  "\r\n"
);

const inabilitadosCsv = Arr.join(
  [
  '"NOME"|"CPF"|"PROCESSO"|"DELIBERACAO"|"DATA TRANSITO JULGADO"|"DATA FINAL"|"DATA ACORDAO"|"UF"|"MUNICIPIO"',
  '"ABDALA GOMES SANTOS"|"215.805.453-00"|"026.615/2020-7"|"AC-000738/2022-PL"|"16/07/2022"|"16/07/2027"|"06/04/2022"|"MA"|"SANTA INES"',
  ],
  "\r\n"
);

const HttpFixture = fixtureLayer([
  { match: pathIncludes("licitantes-inidoneos.csv"), respond: { body: licitantesCsv } },
  {
    match: pathIncludes("resp-contas-julgadas-irregulares.csv"),
    respond: { body: respContasCsv },
  },
  {
    match: pathIncludes("inabilitados-funcao-publica.csv"),
    respond: { body: inabilitadosCsv },
  },
]);

const TestLayer = Layer.mergeAll(
  TcuInidoneosLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const tcu = yield* TcuInidoneos;
  yield* tcu.index;
  return tcu;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("tcu-inidoneos store + csv ingest", (it) => {
  it.effect(
    "indexes the three lists and counts every row",
    () =>
      Effect.gen(function* () {
        const tcu = yield* TcuInidoneos;
        const result = yield* tcu.index;
        expect(result.inserted).toBe(4);
        expect(result.total).toBe(4);
      }),
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
      }),
  );

  it.effect(
    "buscarPorNome matches by bm25 name, falls back to trgm on a typo",
    () =>
      Effect.gen(function* () {
        const tcu = yield* seeded;
        const hit = yield* tcu.buscarPorNome("construcoes servicos");
        expect(Arr.map(hit, (r) => r.docNormalizado)).toContain("07405573000144");
        expect(Option.map(Arr.head(hit), (r) => Number(r.score) > 0)).toEqual(
          Option.some(false)
        );
        const typo = yield* tcu.buscarPorNome("terraplanagen");
        expect(Arr.map(typo, (r) => r.docNormalizado)).toContain("22333444000155");
        expect(Option.map(Arr.head(typo), (r) => Number(r.score) > 0)).toEqual(
          Option.some(true)
        );
      }),
  );
});
