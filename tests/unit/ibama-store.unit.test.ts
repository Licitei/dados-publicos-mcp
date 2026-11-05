import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { Ibama, IbamaLive } from "../../src/sources/ibama/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const autos = storedZip([
  {
    name: "auto_infracao.csv",
    bytes: utf8(
      "SEQ_AUTO_INFRACAO;SIT_CANCELADO;NUM_AUTO_INFRACAO;CPF_CNPJ_INFRATOR;NOME_INFRATOR;DES_INFRACAO;DES_STATUS_FORMULARIO;UF;VAL_AUTO_INFRACAO\r\n1;N;A1;12345678901;Pessoa Física;Desmatamento processo 20261234567 por CPF 12345678901;Lavrado;SP;1.234,56\r\n2;N;A2;12345678000190;Comércio Açúcar;Poluição;Lavrado;DF;500,00\r\n3;S;A3;98765432100;Cancelado;Cancelado;Cancelado;DF;0"
    ),
  },
]);
const embargos = storedZip([
  {
    name: "termo_embargo.csv",
    bytes: utf8(
      "SEQ_TAD;SIT_CANCELADO;NUM_TAD;CPF_CNPJ_EMBARGADO;NOME_EMBARGADO;DES_TAD;DES_STATUS_FORMULARIO;UF;DAT_EMBARGO\r\n11;N;E1;12345678901;Pessoa Física;Área embargada;Lavrado;SP;2026-01-01\r\n12;S;E2;12345678000190;Cancelado;Cancelado;Cancelado;DF;2026-01-01"
    ),
  },
]);
const fixtures = fixtureLayer([
  { match: pathIncludes("/auto_infracao/"), respond: { body: autos } },
  { match: pathIncludes("/termo_embargo/"), respond: { body: embargos } },
]);
const TestLayer = IbamaLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "IBAMA SIFISC ZIP contract",
  (it) => {
    it.effect(
      "masks full CPF before indexing, preserves CNPJ, filters cancelled rows and searches real fuzzy indexes",
      () =>
        Effect.gen(function* () {
          const service = yield* Ibama;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const loaded = yield* service.index;
          expect(loaded).toBe(3);
          const rows = yield* duck.query(
            Schema.Struct({
              documento: Schema.String,
              cnpj: Schema.NullOr(Schema.String),
              nome: Schema.String,
            }),
            "SELECT documento, cnpj, nome FROM ibama_auto ORDER BY id"
          );
          expect(rows).toEqual([
            { documento: "***.456.789-**", cnpj: null, nome: "Pessoa Física" },
            { documento: "12345678000190", cnpj: "12345678000190", nome: "Comércio Açúcar" },
          ]);
          const all = yield* duck.query(
            Schema.Record(Schema.String, Schema.Unknown),
            "SELECT * FROM ibama_auto UNION ALL SELECT * FROM ibama_embargo"
          );
          const serialized = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(all);
          expect(serialized).not.toContain("12345678901");
          expect(serialized).not.toContain("123.456.789-01");
          expect(serialized).not.toContain("98765432100");
          expect(serialized).toContain("20261234567");
          expect(serialized).not.toContain("Cancelado");
          const matches = yield* fuzzy.match("ibama_auto", "acucar");
          expect(matches.length).toBeGreaterThan(0);
        })
    );
  }
);
