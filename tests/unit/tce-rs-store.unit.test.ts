import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { TceRs, TceRsLive } from "../../src/sources/tce-rs/store";
import { fixtureLayer, FixtureServer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { headers } from "./support/tce-rs-headers";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const values = new Map<string, string>([
  ["CD_ORGAO", "88000"],
  ["NM_ORGAO", "Prefeitura"],
  ["NR_LICITACAO", "12"],
  ["ANO_LICITACAO", "2026"],
  ["NR_CONTRATO", "7"],
  ["ANO_CONTRATO", "2026"],
  ["NR_DOCUMENTO", "12345678901"],
  ["NM_PESSOA", "Pessoa"],
  ["DS_OBJETO", "Aquisição de café"],
  ["DS_ITEM", "Café torrado"],
  ["VL_CONTRATO", "1234.56"],
  ["VL_TOTAL_HOMOLOGADO", "1000.50"],
  ["VL_UNITARIO_HOMOLOGADO", "10.005"],
  ["QT_ITENS", "100"],
]);
const archive = (dataset: string, broken: boolean) =>
  storedZip(
    Arr.map(
      Arr.filter(Rec.toEntries(headers), ([name]) => Str.startsWith(`${dataset}/`)(name)),
      ([name, header]) => ({
        name: Str.replace(`${dataset}/`, "")(name),
        bytes: utf8(
          broken
            ? "unknown\nbroken"
            : `${header}\n${Arr.join(
                Arr.map(Str.split(header, ","), (column) => values.get(column) ?? ""),
                ","
              )}`
        ),
      })
    )
  );
const fixtures = fixtureLayer([
  {
    match: pathIncludes("/licitacao/ano/2026.csv.zip"),
    respond: () => ({ body: archive("licitacao", false) }),
  },
  {
    match: pathIncludes("/contrato/ano/2026.csv.zip"),
    respond: (hit) => ({ body: archive("contrato", hit > 1) }),
  },
]);
const TestLayer = TceRsLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "TCE-RS relational annual ZIPs",
  (it) => {
    it.effect(
      "indexes every entry, preserves prices and joins, masks CPF and rolls back drift",
      () =>
        Effect.gen(function* () {
          const service = yield* TceRs;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const server = yield* FixtureServer;
          const count = yield* service.indexYears([2026, 2026]);
          expect(count).toBe(24);
          const rows = yield* duck.query(
            Schema.Struct({
              valor: Schema.Finite,
              fornecedor: Schema.String,
              documento: Schema.String,
            }),
            "SELECT c.VL_CONTRATO AS valor, p.NM_PESSOA AS fornecedor, p.NR_DOCUMENTO AS documento FROM tce_rs_contrato_contrato c JOIN tce_rs_contrato_pessoas p USING (CD_ORGAO, NR_DOCUMENTO)"
          );
          expect(rows).toEqual([
            { valor: 1234.56, fornecedor: "Pessoa", documento: "***.456.789-**" },
          ]);
          const items = yield* duck.query(
            Schema.Struct({ valor: Schema.Finite }),
            "SELECT VL_TOTAL_HOMOLOGADO AS valor FROM tce_rs_licitacao_item"
          );
          expect(items).toEqual([{ valor: 1000.5 }]);
          const matches = yield* fuzzy.match("tce_rs_licitacao_item", "cafe");
          expect(matches.length).toBeGreaterThan(0);
          const failed = yield* Effect.flip(service.indexYears([2026]));
          expect(failed.code).toBe("tce-rs.PARSE");
          const preserved = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM tce_rs_contrato_contrato"
          );
          expect(preserved).toEqual([{ n: 1 }]);
          const hits = yield* server.hits("/dados/licitacon/contrato/ano/2026.csv.zip");
          expect(hits).toBe(2);
        })
    );
  }
);
