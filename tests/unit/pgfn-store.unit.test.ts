import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { Pgfn, PgfnLive } from "../../src/sources/pgfn/store";
import { indexRegistry } from "../../src/serve/index-registry";
import { FixtureServer, fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const csv =
  "CPF_CNPJ;NOME_DEVEDOR;UF_DEVEDOR;NUMERO_INSCRICAO;TIPO_DEVEDOR;SITUACAO_INSCRICAO;DATA_INSCRICAO;VALOR_CONSOLIDADO;INDICADOR_AJUIZADO\r\n12.345.678/0001-90;Comércio Açúcar;SP;123;PRINCIPAL;ATIVA;01/01/2026;1.234,56;SIM\r\n123.456.789-01;Pessoa Física;DF;456;CORRESPONSÁVEL;ATIVA;01/01/2026;100,50;NÃO";
const zip = storedZip([
  { name: "parte_1.csv", bytes: Buffer.from(csv, "latin1") },
  { name: "parte_2.csv", bytes: Buffer.from(csv, "latin1") },
]);
const emptyZip = storedZip([{ name: "README.txt", bytes: Buffer.from("Sem registros") }]);
const fixtures = fixtureLayer([
  {
    match: pathIncludes("Dados_abertos_"),
    respond: (hit) => ({ body: hit === 1 ? zip : emptyZip }),
  },
]);
const TestLayer = PgfnLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "PGFN ZIP parts over real HTTP and DuckDB",
  (it) => {
    it.effect(
      "indexes both light datasets, latin1 accents and amounts without leaking full CPF",
      () =>
        Effect.gen(function* () {
          const service = yield* Pgfn;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const server = yield* FixtureServer;
          const loaded = yield* service.index;
          expect(loaded).toBe(8);
          const rows = yield* duck.query(
            Schema.Struct({
              documento: Schema.String,
              cnpj: Schema.NullOr(Schema.String),
              nome: Schema.String,
              valorConsolidado: Schema.Finite,
            }),
            'SELECT documento, cnpj, nome, "valorConsolidado" FROM pgfn_divida'
          );
          expect(rows).toContainEqual({
            documento: "12345678000190",
            cnpj: "12345678000190",
            nome: "Comércio Açúcar",
            valorConsolidado: 1234.56,
          });
          expect(rows).toContainEqual({
            documento: "***.456.789-**",
            cnpj: null,
            nome: "Pessoa Física",
            valorConsolidado: 100.5,
          });
          const serialized = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
            rows
          );
          expect(serialized).not.toContain("12345678901");
          expect(serialized).not.toContain("123.456.789-01");
          const matches = yield* fuzzy.match("pgfn_divida", "acucar");
          expect(matches.length).toBeGreaterThan(0);
          const heavyHits = yield* server.hits("/Dados_abertos_Nao_Previdenciario.zip");
          expect(heavyHits).toBe(0);
          expect(indexRegistry["pgfn-nao-previdenciario"].heavy).toBe(true);
          yield* service.indexNaoPrevidenciario;
          const counts = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM pgfn_divida_nao_previdenciaria"
          );
          expect(counts).toEqual([{ n: 4 }]);
          const failure = yield* Effect.flip(service.index);
          expect(failure.code).toBe("pgfn.EMPTY");
          const preserved = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM pgfn_divida"
          );
          expect(preserved).toEqual([{ n: 8 }]);
        })
    );
  }
);
