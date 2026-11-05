import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { ListaSuja, ListaSujaLive } from "../../src/sources/mte-lista-suja/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const csv = Buffer.from(
  "ID;Ano da ação fiscal;UF;Empregador;CNPJ/CPF;Estabelecimento;Trabalhadores envolvidos;CNAE;Decisão administrativa de procedência;Inclusão no Cadastro de Empregadores\r\n1;2025;SP;Fazenda Açúcar;12.345.678/0001-90;Fazenda;12;0111-3/01;01/01/2026;01/02/2026\r\n2;2025;DF;Pessoa Física;12345678901;Sítio;3;0111-3/01;01/01/2026;01/02/2026",
  "latin1"
);
const fixtures = fixtureLayer([
  {
    match: pathIncludes("cadastro_de_empregadores.csv"),
    respond: (hit) => (hit === 1 ? { body: csv } : { status: 403, body: "bloqueado" }),
  },
]);
const TestLayer = ListaSujaLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "MTE official CSV contract",
  (it) => {
    it.effect(
      "indexes latin1 data, masks CPF and surfaces a typed 403 while retaining the previous index",
      () =>
        Effect.gen(function* () {
          const service = yield* ListaSuja;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const loaded = yield* service.index;
          expect(loaded).toBe(2);
          const rows = yield* duck.query(
            Schema.Struct({
              documento: Schema.String,
              cnpj: Schema.NullOr(Schema.String),
              nome: Schema.String,
              trabalhadores: Schema.Finite,
            }),
            "SELECT documento, cnpj, nome, trabalhadores FROM mte_lista_suja ORDER BY id"
          );
          expect(rows).toEqual([
            {
              documento: "12345678000190",
              cnpj: "12345678000190",
              nome: "Fazenda Açúcar",
              trabalhadores: 12,
            },
            { documento: "***.456.789-**", cnpj: null, nome: "Pessoa Física", trabalhadores: 3 },
          ]);
          const matches = yield* fuzzy.match("mte_lista_suja", "acucar");
          expect(matches.length).toBeGreaterThan(0);
          const failure = yield* Effect.flip(service.index);
          expect(failure.code).toBe("mte.BLOCKED");
          expect(failure.message).toContain("HTTP 403");
          const preserved = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM mte_lista_suja"
          );
          expect(preserved).toEqual([{ n: 2 }]);
        })
    );
  }
);
