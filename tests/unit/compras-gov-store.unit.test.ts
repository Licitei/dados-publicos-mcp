import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { ComprasGov, ComprasGovLive } from "../../src/sources/compras-gov/store";
import { fixtureLayer, FixtureServer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const orgHeader = "codigoOrgao;nomeOrgao;cnpjCpfOrgao";
const orgCsv = orgHeader + "\n26000;Ministério;00000000000191";
const unitHeader = "codigoUasg;nomeUasg;codigoOrgao;cnpjCpfOrgao";
const unitCsv = unitHeader + "\n153052;Universidade;26000;00000000000191";
const pcaHeader =
  "orgao;numeroArtefato;codigoItemCatalogo;descricaoItemCatalogo;quantidadeItem;valorUnitarioItem;anoPcaProjetoCompra";
const empty = '{"resultado":[],"totalPaginas":0}';
const scope = { mes: "2024-02", orgaos: ["26000"] };
const from = "2024-02-01";
const to = "2024-02-29";
const windowMatches = (url: URL, start: string, end: string) =>
  url.searchParams.get(start) === from && url.searchParams.get(end) === to;
const fixtures = fixtureLayer([
  {
    match: (url) =>
      url.pathname === "/modulo-uasg/2.1_consultarOrgao_CSV" &&
      url.searchParams.get("codigoOrgao") === "26000" &&
      url.searchParams.get("statusOrgao") === "true" &&
      url.searchParams.get("pagina") === "1",
    respond: { body: orgCsv },
  },
  { match: pathIncludes("/modulo-uasg/2.1_"), respond: { body: orgHeader } },
  {
    match: (url) =>
      url.pathname === "/modulo-uasg/1.1_consultarUasg_CSV" &&
      url.searchParams.get("cnpjCpfOrgao") === "00000000000191" &&
      url.searchParams.get("statusUasg") === "true" &&
      url.searchParams.get("pagina") === "1",
    respond: { body: unitCsv },
  },
  { match: pathIncludes("/modulo-uasg/1.1_"), respond: { body: unitHeader } },
  {
    match: (url) =>
      url.pathname === "/modulo-legado/1_consultarLicitacao" &&
      url.searchParams.get("uasg") === "153052" &&
      windowMatches(url, "data_publicacao_inicial", "data_publicacao_final") &&
      url.searchParams.get("pagina") === "1",
    respond: {
      body: '{"resultado":[{"id_compra":"purchase1","uasg":153052,"objeto":"Café"}],"totalPaginas":2}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-legado/1_consultarLicitacao" &&
      url.searchParams.get("pagina") === "2",
    respond: { body: '{"resultado":[{"id_compra":"purchase2","objeto":"Café"}],"totalPaginas":2}' },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-legado/2.1_consultarItemLicitacao_Id" &&
      ["purchase1", "purchase2"].includes(url.searchParams.get("id_compra") ?? ""),
    respond: {
      body: '{"resultado":[{"id_compra_item":"item1","descricao_item":"Café","cnpj_fornecedor":"12345678000190"}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-legado/3_consultarPregoes" &&
      windowMatches(url, "dt_data_edital_inicial", "dt_data_edital_final") &&
      url.searchParams.get("co_uasg") === "153052",
    respond: {
      body: '{"resultado":[{"id_compra":"pregao1","tx_objeto":"Café"}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-legado/4_consultarItensPregoes" &&
      windowMatches(url, "dt_hom_inicial", "dt_hom_final") &&
      url.searchParams.get("co_uasg") === "153052",
    respond: {
      body: '{"resultado":[{"id_compra_item":"pregaoitem1","descricao_item":"Café","fornecedor_vencedor":"12345678000190","valor_homologado_item":"100.00"}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-contratos/1_consultarContratos" &&
      url.searchParams.get("codigoOrgao") === "26000" &&
      windowMatches(url, "dataVigenciaInicialMin", "dataVigenciaInicialMax"),
    respond: (hit) => ({
      body:
        hit === 1
          ? '{"resultado":[{"numeroContrato":"old","objeto":"Café","niFornecedor":"12345678000190","valorGlobal":1000}],"totalPaginas":1}'
          : '{"resultado":[{"numeroContrato":"new","objeto":"Café","niFornecedor":"12345678000190","valorGlobal":2000}],"totalPaginas":1}',
    }),
  },
  {
    match: (url) =>
      url.pathname === "/modulo-contratos/2_consultarContratosItem" &&
      url.searchParams.get("codigoOrgao") === "26000" &&
      windowMatches(url, "dataVigenciaInicialMin", "dataVigenciaInicialMax"),
    respond: {
      body: '{"resultado":[{"numeroContrato":"old","descricaoIitem":"Café","valorUnitarioItem":12.3,"quantidadeItem":10,"niFornecedor":"12345678000190"}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-arp/1_consultarARP" &&
      url.searchParams.get("codigoUnidadeGerenciadora") === "153052" &&
      windowMatches(url, "dataVigenciaInicialMin", "dataVigenciaInicialMax"),
    respond: {
      body: '{"resultado":[{"numeroAtaRegistroPreco":"ata1","objeto":"Café"}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-arp/2_consultarARPItem" &&
      url.searchParams.get("codigoUnidadeGerenciadora") === "153052" &&
      windowMatches(url, "dataVigenciaInicialMin", "dataVigenciaInicialMax"),
    respond: {
      body: '{"resultado":[{"numeroAtaRegistroPreco":"ata1","descricaoItem":"Café","niFornecedor":"12345678000190","valorUnitario":12.3}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133" &&
      url.searchParams.get("orgaoEntidadeCnpj") === "00000000000191" &&
      windowMatches(url, "dataResultadoPncpInicial", "dataResultadoPncpFinal"),
    respond: {
      body: '{"resultado":[{"idCompraItem":"result1","niFornecedor":"12345678000190","nomeRazaoSocialFornecedor":"Fornecedor Café","valorUnitarioHomologado":12.3,"quantidadeHomologada":10}],"totalPaginas":1}',
    },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-fornecedor/1_consultarFornecedor" &&
      url.searchParams.get("cnpj") === "12345678000190" &&
      url.searchParams.get("ativo") === "true",
    respond: (hit) =>
      hit <= 2
        ? {
            body: '{"resultado":[{"cnpj":"12345678000190","nomeRazaoSocialFornecedor":"Fornecedor Café","ativo":true}],"totalPaginas":1}',
          }
        : { status: 404, body: "indisponível" },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-fornecedor/1_consultarFornecedor" &&
      url.searchParams.get("ativo") === "false",
    respond: { body: empty },
  },
  {
    match: (url) =>
      url.pathname === "/modulo-pgc/1.1_consultarPgcDetalhe_CSV" &&
      url.searchParams.get("orgao") === "26000" &&
      url.searchParams.get("anoPcaProjetoCompra") === "2024" &&
      url.searchParams.get("pagina") === "1",
    respond: { body: pcaHeader + "\n26000;1;100;Café;10;12.3;2024" },
  },
  { match: pathIncludes("/modulo-pgc/1.1_"), respond: { body: pcaHeader } },
]);
const TestLayer = ComprasGovLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(90), excludeTestServices: true })(
  "Compras.gov.br actual endpoint contracts",
  (it) => {
    it.effect(
      "requires explicit scope, paginates real CSV/JSON fixtures and publishes all tables only after success",
      () =>
        Effect.gen(function* () {
          const service = yield* ComprasGov;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const server = yield* FixtureServer;
          const invalid = yield* Effect.flip(service.index);
          expect(invalid.code).toBe("compras.SCOPE");
          const untouched = yield* server.hits("/modulo-uasg/2.1_consultarOrgao_CSV");
          expect(untouched).toBe(0);
          const loaded = yield* service.indexScope(scope);
          expect(loaded).toBe(15);
          const prices = yield* duck.query(
            Schema.Struct({ niFornecedor: Schema.String, valorUnitarioHomologado: Schema.Finite }),
            'SELECT "niFornecedor", "valorUnitarioHomologado" FROM compras_resultado'
          );
          expect(prices).toEqual([
            { niFornecedor: "12345678000190", valorUnitarioHomologado: 12.3 },
          ]);
          const matches = yield* fuzzy.match("compras_resultado", "cafe");
          expect(matches.length).toBeGreaterThan(0);
          const pages = yield* server.hits("/modulo-legado/1_consultarLicitacao");
          expect(pages).toBe(2);
          const failed = yield* Effect.flip(service.indexScope(scope));
          expect(failed.code).toBe("compras.DOWNLOAD");
          const preserved = yield* duck.query(
            Schema.Struct({ numeroContrato: Schema.String }),
            'SELECT "numeroContrato" FROM compras_contrato'
          );
          expect(preserved).toEqual([{ numeroContrato: "old" }]);
        })
    );
  }
);
const LimitLayer = ComprasGovLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      TestDuckLive,
      TestFuzzyLive,
      fixtureLayer([{ match: pathIncludes("/modulo-uasg/2.1_"), respond: { body: orgCsv } }])
    )
  )
);
layer(LimitLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "Compras.gov.br bounded fan-out",
  (it) => {
    it.effect("aborts a non-terminating CSV endpoint at the declared page budget", () =>
      Effect.gen(function* () {
        const service = yield* ComprasGov;
        const server = yield* FixtureServer;
        const failure = yield* Effect.flip(service.indexScope(scope));
        expect(failure.code).toBe("compras.LIMIT");
        const hits = yield* server.hits("/modulo-uasg/2.1_consultarOrgao_CSV");
        expect(hits).toBeLessThanOrEqual(200);
      })
    );
  }
);
