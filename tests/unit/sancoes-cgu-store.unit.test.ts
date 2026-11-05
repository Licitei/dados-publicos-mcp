import { expect, layer } from "@effect/vitest";
import { DateTime, Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { SancoesCgu, SancoesCguLive } from "../../src/sources/sancoes-cgu/store";
import { yyyymmdd } from "../../src/sources/sancoes-cgu/catalog";
import { FixtureServer, fixtureLayer } from "./support/fixture-server";
import { storedZip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const latin1 = (text: string) =>
  Uint8Array.from(
    Arr.map(Arr.fromIterable(text), (char) => Option.getOrElse(Str.charCodeAt(char, 0), () => 63))
  );

const nowMillis = () => DateTime.nowUnsafe().epochMilliseconds;

const snapshotDate = () => yyyymmdd(nowMillis(), 2);
const beforeDate = () => yyyymmdd(nowMillis(), 1);

const ceisCsv = Arr.join(
  [
    '"CODIGO DA SANCAO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"RAZAO SOCIAL - CADASTRO RECEITA";"CATEGORIA DA SANCAO";"NUMERO DO PROCESSO";"DATA INICIO SANCAO";"DATA FINAL SANCAO";"ORGAO SANCIONADOR";"UF ORGAO SANCIONADOR";"FUNDAMENTACAO LEGAL"',
    '"S1";"J";"11.222.333/0001-81";"EMPRESA ALPHA LTDA";"ALPHA SERVIÇOS LTDA";"Inidônea";"PROC-1";"01/01/2023";"31/12/2025";"CGU";"DF";"Lei 8.666"',
    '"S2";"F";"111.222.333-44";"JOÃO DA SILVA";"";"Suspensa";"PROC-2";"01/06/2020";"01/06/2022";"TCU";"SP";"Lei 8.666"',
  ],
  "\r\n"
);

const ceisZip = storedZip([{ name: "snapshot_CEIS.csv", bytes: latin1(ceisCsv) }]);

const HttpFixture = fixtureLayer([
  {
    match: (url) => Str.includes(`${snapshotDate()}_CEIS.zip`)(url.pathname),
    respond: { body: ceisZip },
  },
]);

const TestLayer = SancoesCguLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "sancoes-cgu store + date-regression + zip/csv ingest",
  (it) => {
    it.effect("regresses dates to the CEIS snapshot and skips datasets with no file", () =>
      Effect.gen(function* () {
        const sancoes = yield* SancoesCgu;
        const result = yield* sancoes.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
        const server = yield* FixtureServer;
        const ceisPath = (date: string) => `/PortalDaTransparencia/saida/ceis/${date}_CEIS.zip`;
        expect(beforeDate()).not.toBe(snapshotDate());
        const beforeHits = yield* server.hits(ceisPath(beforeDate()));
        const snapshotHits = yield* server.hits(ceisPath(snapshotDate()));
        expect(beforeHits).toBeGreaterThan(0);
        expect(snapshotHits).toBe(1);
      })
    );
  }
);
