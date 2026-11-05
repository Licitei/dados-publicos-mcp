import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { Bndes, BndesLive } from "../../src/sources/bndes/store";
import { fixtureLayer, FixtureServer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const operationUrl =
  "https://dadosabertos.bndes.gov.br/dataset/fixture/resource/operations/download/nao-automaticas.csv";
const entityUrl =
  "https://dadosabertos.bndes.gov.br/dataset/fixture/resource/entities/download/entes.csv";
const fixtures = fixtureLayer([
  {
    match: (url) =>
      url.pathname === "/api/3/action/package_show" &&
      url.searchParams.get("id") === "operacoes-financiamento",
    respond: {
      body:
        '{"success":true,"result":{"resources":[{"name":"Operações indiretas automáticas","format":"CSV","url":"https://dadosabertos.bndes.gov.br/dataset/huge.csv"},{"name":"Operações não automáticas","format":"CSV","url":"' +
        operationUrl +
        '"}]}}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/api/3/action/package_show" &&
      url.searchParams.get("id") === "operacoes-com-entes-da-administracao-publica-direta",
    respond: {
      body:
        '{"success":true,"result":{"resources":[{"name":"Operações com Entes da Administração Direta","format":"CSV","url":"' +
        entityUrl +
        '"}]}}',
    },
  },
  {
    match: pathIncludes("/nao-automaticas.csv"),
    respond: {
      body: Buffer.from(
        "cliente;cnpj;descricao_do_projeto;uf;municipio;numero_do_contrato;data_da_contratacao;valor_contratado_reais;valor_desembolsado_reais;situacao_do_contrato\r\nComércio Açúcar;12.345.678/0001-90;Financiamento;SP;São Paulo;123;2026-01-01;1.234,56;1.000,00;Ativo",
        "latin1"
      ),
    },
  },
  {
    match: pathIncludes("/entes.csv"),
    respond: {
      body: Buffer.from(
        "ente_publico;uf;municipio;programa;modalidade_operacional;data_do_nivel_atual;nivel_atual;valor_da_operacao_historico_em_reais;valor_desembolsado_em_reais;saldo_a_liberar_atualizado_em_reais;objetivo_do_projeto;situacao_da_operacao\r\nMunicípio;SP;São Paulo;Programa;Direta;2026-01-01;Contratada;2.000,00;1.000,00;1.000,00;Saneamento;Ativa",
        "latin1"
      ),
    },
  },
]);
const TestLayer = BndesLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "BNDES CKAN and Windows-1252 CSV",
  (it) => {
    it.effect(
      "discovers the two intended resources and never downloads the huge indirect automatic dataset",
      () =>
        Effect.gen(function* () {
          const service = yield* Bndes;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const server = yield* FixtureServer;
          const loaded = yield* service.index;
          expect(loaded).toBe(2);
          const rows = yield* duck.query(
            Schema.Struct({
              cnpj: Schema.String,
              nome: Schema.String,
              valorContratado: Schema.Finite,
            }),
            'SELECT cnpj, nome, "valorContratado" FROM bndes_operacao'
          );
          expect(rows).toEqual([
            { cnpj: "12345678000190", nome: "Comércio Açúcar", valorContratado: 1234.56 },
          ]);
          const entities = yield* duck.query(
            Schema.Struct({ nome: Schema.String, valorOperacao: Schema.Finite }),
            'SELECT nome, "valorOperacao" FROM bndes_ente'
          );
          expect(entities).toEqual([{ nome: "Município", valorOperacao: 2000 }]);
          const huge = yield* server.hits("/dataset/huge.csv");
          expect(huge).toBe(0);
          const matches = yield* fuzzy.match("bndes_operacao", "acucar");
          expect(matches.length).toBeGreaterThan(0);
        })
    );
  }
);
