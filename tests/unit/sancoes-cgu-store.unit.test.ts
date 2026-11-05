import { expect, layer } from "@effect/vitest";
import { DateTime, Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import {
  SancoesCgu,
  SancoesCguLive,
} from "../../src/sources/sancoes-cgu/store";
import { yyyymmdd } from "../../src/sources/sancoes-cgu/catalog";
import { FixtureServer, fixtureLayer } from "./support/fixture-server";
import { storedZip } from "./support/stored-zip";
import { TestDbLive } from "./support/test-db";

const latin1 = (text: string) =>
  Uint8Array.from(
    Arr.map(Arr.fromIterable(text), (char) =>
      Option.getOrElse(Str.charCodeAt(char, 0), () => 63)
    )
  );

const nowMillis = () => DateTime.nowUnsafe().epochMilliseconds;

const snapshotDate = () => yyyymmdd(nowMillis(), 2);
const beforeDate = () => yyyymmdd(nowMillis(), 1);

const ceisCsv = Arr.join([
  '"CODIGO DA SANCAO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"RAZAO SOCIAL - CADASTRO RECEITA";"CATEGORIA DA SANCAO";"NUMERO DO PROCESSO";"DATA INICIO SANCAO";"DATA FINAL SANCAO";"ORGAO SANCIONADOR";"UF ORGAO SANCIONADOR";"FUNDAMENTACAO LEGAL"',
  '"S1";"J";"11.222.333/0001-81";"EMPRESA ALPHA LTDA";"ALPHA SERVIÇOS LTDA";"Inidônea";"PROC-1";"01/01/2023";"31/12/2025";"CGU";"DF";"Lei 8.666"',
  '"S2";"F";"111.222.333-44";"JOÃO DA SILVA";"";"Suspensa";"PROC-2";"01/06/2020";"01/06/2022";"TCU";"SP";"Lei 8.666"',
], "\r\n");

const ceisZip = storedZip([
  { name: "snapshot_CEIS.csv", bytes: latin1(ceisCsv) },
]);

const HttpFixture = fixtureLayer([
  {
    match: (url) => Str.includes(`${snapshotDate()}_CEIS.zip`)(url.pathname),
    respond: { body: ceisZip },
  },
]);

const TestLayer = Layer.mergeAll(
  SancoesCguLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const sancoes = yield* SancoesCgu;
  yield* sancoes.index;
  return sancoes;
});

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })("sancoes-cgu store + date-regression + zip/csv ingest", (it) => {
  it.effect(
    "regresses dates to the CEIS snapshot and skips datasets with no file",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* SancoesCgu;
        const result = yield* sancoes.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
        const server = yield* FixtureServer;
        const ceisPath = (date: string) =>
          `/PortalDaTransparencia/saida/ceis/${date}_CEIS.zip`;
        expect(beforeDate()).not.toBe(snapshotDate());
        const beforeHits = yield* server.hits(ceisPath(beforeDate()));
        const snapshotHits = yield* server.hits(ceisPath(snapshotDate()));
        expect(beforeHits).toBeGreaterThan(0);
        expect(snapshotHits).toBe(1);
      }),
  );

  it.effect(
    "verificar matches all rows by normalized document, by cnpj or cpf",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const porCnpj = yield* sancoes.verificar("11.222.333/0001-81");
        expect(porCnpj.docNormalizado).toBe("11222333000181");
        expect(porCnpj.tipoDocumento).toBe("cnpj");
        expect(porCnpj.sancionado).toBe(true);
        expect(porCnpj.inidoneoOuImpedido).toBe(true);
        expect(porCnpj.total).toBe(1);
        expect(porCnpj.porLista).toEqual({ ceis: 1 });
        expect(Option.map(Arr.head(porCnpj.sancoes), (r) => r.nome)).toEqual(
          Option.some("EMPRESA ALPHA LTDA")
        );
        const porCpf = yield* sancoes.verificar("111.222.333-44");
        expect(porCpf.tipoDocumento).toBe("cpf");
        expect(Option.map(Arr.head(porCpf.sancoes), (r) => r.nome)).toEqual(
          Option.some("JOÃO DA SILVA")
        );
        const ausente = yield* sancoes.verificar("00000000000000");
        expect(ausente.sancionado).toBe(false);
        expect(ausente.total).toBe(0);
      }),
  );

  it.effect(
    "buscarPorNome matches by bm25 name, falls back to trgm on a typo",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const hit = yield* sancoes.buscarPorNome("alpha");
        expect(Arr.map(hit, (r) => r.docNormalizado)).toContain("11222333000181");
        expect(Option.map(Arr.head(hit), (r) => Number(r.score) < 0)).toEqual(
          Option.some(true)
        );
        const typo = yield* sancoes.buscarPorNome("alpa");
        expect(Arr.map(typo, (r) => r.docNormalizado)).toContain("11222333000181");
        expect(Option.map(Arr.head(typo), (r) => Number(r.score) > 0)).toEqual(
          Option.some(true)
        );
      }),
  );

  it.effect(
    "vigentesNaData lists sanctions active on a date, excluding expired ones",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const dentro = yield* sancoes.vigentesNaData("2024-06-15");
        expect(Arr.map(dentro, (r) => r.codigo)).toEqual(["S1"]);
        const fora = yield* sancoes.vigentesNaData("2026-06-15");
        expect(fora).toHaveLength(0);
        const cedo = yield* sancoes.vigentesNaData("2021-01-01");
        expect(Arr.map(cedo, (r) => r.codigo)).toEqual(["S2"]);
      }),
  );
});
