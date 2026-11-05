import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import {
  PortalTransparencia,
  PortalTransparenciaLive,
} from "../../src/sources/portal-transparencia/store";
import { fixtureLayer, FixtureServer, pathIncludes } from "./support/fixture-server";
import { storedZip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const pep = storedZip([
  {
    name: "202601_PEP.csv",
    bytes: Buffer.from(
      "CPF;Nome_PEP;Descricao_Funcao;Nome_Orgao;Data_Inicio_Exercicio;Data_Fim_Exercicio;Data_Fim_Carencia\r\n12345678901;Pessoa Política;Direção;Órgão;01/01/2026;;",
      "latin1"
    ),
  },
]);
const cpgf = storedZip([
  {
    name: "202601_CPGF.csv",
    bytes: Buffer.from(
      "CNPJ ou CPF Favorecido;Nome Favorecido;CPF Portador;Nome Portador;Nome Órgão;Nome Unidade Gestora;Transação;Data Transação;Valor Transação\r\n12.345.678/0001-90;Comércio;12345678901;Pessoa Política;Órgão;Unidade;Compra;01/01/2026;1.234,56",
      "latin1"
    ),
  },
]);
const emendas = storedZip([
  {
    name: "2026_Emendas.csv",
    bytes: Buffer.from(
      "Código da Emenda;Ano da Emenda;Tipo de Emenda;Nome do Autor da Emenda;Localidade de aplicação do recurso;Função;Valor Empenhado;Valor Liquidado;Valor Pago\r\n20260001;2026;Individual;Autor;São Paulo;Saúde;1.000,00;800,00;700,00",
      "latin1"
    ),
  },
]);
const siape = storedZip([
  {
    name: "202601_Cadastro.csv",
    bytes: Buffer.from(
      "CPF;NOME;ORG_LOTACAO;UORG_LOTACAO;DESCRICAO_CARGO;SITUACAO_VINCULO;REGIME_JURIDICO\r\n12345678901;Servidor Público;Órgão;Unidade;Analista;Ativo;Estatutário",
      "latin1"
    ),
  },
  { name: "202601_Remuneracao.csv", bytes: Buffer.from("Ignore esta tabela") },
]);
const fixtures = fixtureLayer([
  {
    match: pathIncludes("/download-de-dados/pep/202601"),
    respond: { status: 302, headers: { location: "/archive/pep" } },
  },
  { match: pathIncludes("/archive/pep"), respond: { body: pep } },
  { match: pathIncludes("/download-de-dados/cpgf/202601"), respond: { body: cpgf } },
  {
    match: pathIncludes("/download-de-dados/emendas-parlamentares/2026"),
    respond: { body: emendas },
  },
  { match: pathIncludes("/download-de-dados/servidores/202601"), respond: { body: siape } },
]);
const TestLayer = PortalTransparenciaLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "Portal bulk archives through real HTTP",
  (it) => {
    it.effect(
      "probes HEAD, follows redirects, records periods and masks natural-person documents",
      () =>
        Effect.gen(function* () {
          const service = yield* PortalTransparencia;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const server = yield* FixtureServer;
          const loaded = yield* service.indexMonth("2026-01");
          expect(loaded).toBe(3);
          const rows = yield* duck.query(
            Schema.Struct({
              documento: Schema.String,
              nome: Schema.String,
              periodo: Schema.String,
            }),
            "SELECT documento, nome, periodo FROM portal_pep"
          );
          expect(rows).toEqual([
            { documento: "***.456.789-**", nome: "Pessoa Política", periodo: "202601" },
          ]);
          const values = yield* duck.query(
            Schema.Struct({
              cnpj: Schema.String,
              valor: Schema.Finite,
              documentoPortador: Schema.String,
            }),
            'SELECT cnpj, valor, "documentoPortador" FROM portal_cpgf'
          );
          expect(values).toEqual([
            { cnpj: "12345678000190", valor: 1234.56, documentoPortador: "***.456.789-**" },
          ]);
          const hits = yield* server.hits("/archive/pep");
          expect(hits).toBe(2);
          const matches = yield* fuzzy.match("portal_pep", "politica");
          expect(matches.length).toBeGreaterThan(0);
          const siapeCount = yield* service.indexSiapeMonth("2026-01");
          expect(siapeCount).toBe(1);
          const servers = yield* duck.query(
            Schema.Struct({ documento: Schema.String }),
            "SELECT documento FROM portal_servidor"
          );
          expect(servers).toEqual([{ documento: "***.456.789-**" }]);
        })
    );
  }
);
const BlockedLayer = PortalTransparenciaLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      TestDuckLive,
      TestFuzzyLive,
      fixtureLayer([
        { match: pathIncludes("/download-de-dados/"), respond: { status: 403, body: "bloqueado" } },
      ])
    )
  )
);
layer(BlockedLayer, { excludeTestServices: true })("Portal blocked upstream", (it) => {
  it.effect("surfaces an explicit typed block without a stale fallback", () =>
    Effect.gen(function* () {
      const service = yield* PortalTransparencia;
      const failure = yield* Effect.flip(service.indexMonth("2026-01"));
      expect(failure.code).toBe("portal.BLOCKED");
      expect(failure.message).toContain("HTTP 403");
    })
  );
});
