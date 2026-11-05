import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { Duck } from "../../src/kernel/duck/duck";
import { ataTable, contratacaoTable, contratoTable } from "../../src/sources/pncp/catalog";
import { Pncp, PncpLive } from "../../src/sources/pncp/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const contratacoes = [
  {
    numeroControlePNCP: "00000000000191-1-000001/2026",
    anoCompra: 2026,
    sequencialCompra: 1,
    objetoCompra: "Aquisicao de notebooks e computadores para escolas",
    modalidadeId: 6,
    modalidadeNome: "Pregao",
    situacaoCompraNome: "Divulgada no PNCP",
    valorTotalEstimado: 250000.5,
    valorTotalHomologado: null,
    dataPublicacaoPncp: "2026-01-10",
    dataAberturaProposta: "2026-01-12",
    dataEncerramentoProposta: "2026-01-20",
    dataAtualizacaoGlobal: "2026-01-11",
    srp: true,
    orgaoEntidade: {
      cnpj: "00000000000191",
      razaoSocial: "Prefeitura de Sao Paulo",
      esferaId: "M",
      poderId: "E",
    },
    unidadeOrgao: {
      codigoIbge: "3550308",
      municipioNome: "Sao Paulo",
      ufSigla: "SP",
    },
  },
  {
    numeroControlePNCP: "00000000000272-1-000002/2026",
    anoCompra: 2026,
    sequencialCompra: 2,
    objetoCompra: "Contratacao de servico de limpeza predial",
    modalidadeId: 6,
    modalidadeNome: "Pregao",
    situacaoCompraNome: "Divulgada no PNCP",
    valorTotalEstimado: 90000,
    valorTotalHomologado: null,
    dataPublicacaoPncp: "2026-01-15",
    dataAberturaProposta: "2026-01-17",
    dataEncerramentoProposta: "2026-01-25",
    dataAtualizacaoGlobal: "2026-01-16",
    srp: false,
    orgaoEntidade: {
      cnpj: "00000000000272",
      razaoSocial: "Prefeitura de Curitiba",
      esferaId: "M",
      poderId: "E",
    },
    unidadeOrgao: {
      codigoIbge: "4106902",
      municipioNome: "Curitiba",
      ufSigla: "PR",
    },
  },
];

const contratos = [
  {
    numeroControlePNCP: "00000000000191-2-000001/2026",
    numeroControlePncpCompra: "00000000000191-1-000001/2026",
    anoContrato: 2026,
    sequencialContrato: 1,
    objetoContrato: "Fornecimento de notebooks corporativos",
    niFornecedor: "12.345.678/0001-90",
    tipoPessoa: "PJ",
    nomeRazaoSocialFornecedor: "Tecnologia Quantum Solucoes LTDA",
    valorInicial: 200000,
    valorGlobal: 220000,
    valorAcumulado: 220000,
    dataAssinatura: "2026-01-22",
    dataVigenciaInicio: "2026-01-22",
    dataVigenciaFim: "2026-12-31",
    dataPublicacaoPncp: "2026-01-23",
    dataAtualizacaoGlobal: "2026-01-23",
    tipoContrato: "Compra",
    orgaoEntidade: {
      cnpj: "00000000000191",
      razaoSocial: "Prefeitura de Sao Paulo",
    },
    unidadeOrgao: { codigoIbge: "3550308", ufSigla: "SP" },
  },
  {
    numeroControlePNCP: "00000000000272-2-000002/2026",
    numeroControlePncpCompra: "00000000000272-1-000002/2026",
    anoContrato: 2026,
    sequencialContrato: 2,
    objetoContrato: "Prestacao de servico de limpeza",
    niFornecedor: "98765432000155",
    tipoPessoa: "PJ",
    nomeRazaoSocialFornecedor: "Conservadora Brilho Total LTDA",
    valorInicial: 80000,
    valorGlobal: 85000,
    valorAcumulado: 85000,
    dataAssinatura: "2026-01-26",
    dataVigenciaInicio: "2026-01-26",
    dataVigenciaFim: "2026-12-31",
    dataPublicacaoPncp: "2026-01-27",
    dataAtualizacaoGlobal: "2026-01-27",
    tipoContrato: "Servico",
    orgaoEntidade: {
      cnpj: "00000000000272",
      razaoSocial: "Prefeitura de Curitiba",
    },
    unidadeOrgao: { codigoIbge: "4106902", ufSigla: "PR" },
  },
];

const atas = [
  {
    numeroControlePNCPAta: "00000000000191-3-000001/2026",
    numeroControlePNCPCompra: "00000000000191-1-000001/2026",
    anoAta: 2026,
    numeroAtaRegistroPreco: "001/2026",
    objetoContratacao: "Registro de preco para aquisicao de notebooks",
    vigenciaInicio: "2026-02-01",
    vigenciaFim: "2027-01-31",
    dataAtualizacaoGlobal: "2026-01-30",
    cnpjOrgao: "00000000000191",
    nomeOrgao: "Prefeitura de Sao Paulo",
    codigoUnidadeOrgao: "1",
    ufSigla: "SP",
  },
  {
    numeroControlePNCPAta: "00000000000272-3-000002/2026",
    numeroControlePNCPCompra: "00000000000272-1-000002/2026",
    anoAta: 2026,
    numeroAtaRegistroPreco: "002/2026",
    objetoContratacao: "Registro de preco para limpeza predial",
    vigenciaInicio: "2026-02-01",
    vigenciaFim: "2027-01-31",
    dataAtualizacaoGlobal: "2026-01-31",
    cnpjOrgao: "00000000000272",
    nomeOrgao: "Prefeitura de Curitiba",
    codigoUnidadeOrgao: "1",
    ufSigla: "PR",
  },
];

const toJson = (value: unknown) =>
  Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(value).pipe(
    Option.getOrElse(() => "")
  );

const pageOf = (data: readonly unknown[], totalPaginas: number) => toJson({ data, totalPaginas });

const query =
  (suffix: string, pagina: string, modalidade?: string) =>
  (url: URL): boolean =>
    Str.includes(suffix)(url.pathname) &&
    url.searchParams.get("pagina") === pagina &&
    (modalidade === undefined ||
      url.searchParams.get("codigoModalidadeContratacao") === modalidade);

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/itens"),
    respond: {
      body: toJson([
        {
          numeroItem: 1,
          descricao: "Notebook",
          quantidade: 10,
          unidadeMedida: "UN",
          valorUnitarioEstimado: 1000,
          valorTotal: 10000,
          materialOuServico: "M",
        },
      ]),
    },
  },
  {
    match: (url) =>
      Str.endsWith("/instrumentoscobranca/inclusao")(url.pathname) &&
      url.searchParams.get("dataInicial") === "20260101" &&
      url.searchParams.get("dataFinal") === "20260131" &&
      Number(url.searchParams.get("tamanhoPagina")) <= 100,
    respond: {
      body: pageOf(
        [
          {
            cnpj: "00000000000191",
            ano: 2026,
            sequencialContrato: 1,
            sequencialInstrumentoCobranca: 1,
            numeroInstrumentoCobranca: "NF1",
            dataEmissaoDocumento: "2026-01-25",
            recuperarContratoDTO: contratos[0],
          },
        ],
        1
      ),
    },
  },
  {
    match: query("contratacoes/publicacao", "1", "6"),
    respond: { body: pageOf(contratacoes, 1) },
  },
  {
    match: pathIncludes("contratacoes/publicacao"),
    respond: { body: pageOf([], 1) },
  },
  {
    match: query("/contratos", "1"),
    respond: { body: pageOf(Arr.take(contratos, 1), 2) },
  },
  {
    match: query("/contratos", "2"),
    respond: { body: pageOf(Arr.drop(contratos, 1), 2) },
  },
  {
    match: pathIncludes("/contratos"),
    respond: { body: pageOf([], 2) },
  },
  {
    match: query("/atas", "1"),
    respond: { body: pageOf(atas, 1) },
  },
  {
    match: pathIncludes("/atas"),
    respond: { body: pageOf([], 1) },
  },
]);

const Infra = Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture);

const TestLayer = PncpLive.pipe(Layer.provideMerge(Infra));

const scope = {
  dataInicial: "20260101",
  dataFinal: "20260131",
  modalidades: [6, 8],
} as const;

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "pncp store + paginated harvest + DuckDB bm25 + fuzzy",
  (it) => {
    it.effect("indexScope harvests and counts the three entities", () =>
      Effect.gen(function* () {
        const pncp = yield* Pncp;
        const total = yield* pncp.indexScope(scope);
        expect(total).toEqual({
          contratacoes: 2,
          contratos: 2,
          atas: 2,
          itens: 2,
          instrumentos: 1,
        });
        const duck = yield* Duck;
        const contratacoesCount = yield* duck.count(contratacaoTable);
        const contratosCount = yield* duck.count(contratoTable);
        const atasCount = yield* duck.count(ataTable);
        expect(contratacoesCount).toBe(2);
        expect(contratosCount).toBe(2);
        expect(atasCount).toBe(2);
      })
    );

    it.effect("indexes item prices and billing instruments with normalized date windows", () =>
      Effect.gen(function* () {
        const pncp = yield* Pncp;
        yield* pncp.indexScope({ ...scope, dataInicial: "2026-01-01", dataFinal: "2026-01-31" });
        const duck = yield* Duck;
        const items = yield* duck.query(
          Schema.Struct({ numeroItem: Schema.Finite, valorUnitarioEstimado: Schema.Finite }),
          'SELECT "numeroItem", "valorUnitarioEstimado" FROM pncp_item'
        );
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ numeroItem: 1, valorUnitarioEstimado: 1000 });
        const bills = yield* duck.query(
          Schema.Struct({ numeroInstrumento: Schema.String, documentoFornecedor: Schema.String }),
          'SELECT "numeroInstrumento", "documentoFornecedor" FROM pncp_instrumento_cobranca'
        );
        expect(bills).toEqual([
          { numeroInstrumento: "NF1", documentoFornecedor: "12345678000190" },
        ]);
      })
    );
  }
);
