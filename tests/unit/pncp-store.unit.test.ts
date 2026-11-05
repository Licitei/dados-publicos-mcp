import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { sql } from "drizzle-orm";
import { Db } from "../../src/kernel/db/client";
import { Pncp, PncpLive } from "../../src/sources/pncp/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestEmbedderLive } from "./support/test-embedder";
import { TestDbLive } from "./support/test-db";

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
  Effect.runSync(
    Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value)
  );

const pageOf = (data: readonly unknown[], totalPaginas: number) =>
  toJson({ data, totalPaginas });

const query =
  (suffix: string, pagina: string, modalidade?: string) =>
  (url: URL): boolean =>
    Str.includes(suffix)(url.pathname) &&
    url.searchParams.get("pagina") === pagina &&
    (modalidade === undefined ||
      url.searchParams.get("codigoModalidadeContratacao") === modalidade);

const HttpFixture = fixtureLayer([
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

const TestLayer = Layer.mergeAll(
  PncpLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, TestEmbedderLive, HttpFixture))
  ),
  TestDbLive,
  TestEmbedderLive,
  HttpFixture
);

const scope = {
  dataInicial: "20260101",
  dataFinal: "20260131",
  modalidades: [6, 8],
} as const;

const pick = <A, B>(xs: readonly A[], index: number, f: (a: A) => B) =>
  Arr.get(xs, index).pipe(Option.map(f));

const seeded = Effect.gen(function* () {
  const pncp = yield* Pncp;
  yield* pncp.indexScope(scope);
  return pncp;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("pncp store + paginated harvest + hybrid RRF", (it) => {
  it.effect(
    "indexScope harvests and counts the three entities",
    () =>
      Effect.gen(function* () {
        const pncp = yield* Pncp;
        const total = yield* pncp.indexScope(scope);
        expect(total).toEqual({ contratacoes: 2, contratos: 2, atas: 2 });
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select
            (select count(*)::int from contratacao) as contratacoes,
            (select count(*)::int from contrato) as contratos,
            (select count(*)::int from ata) as atas`
        ).pipe(Effect.map(({ rows }) => rows));
        expect(pick(rows, 0, (r) => Number(r.contratacoes))).toEqual(
          Option.some(2)
        );
        expect(pick(rows, 0, (r) => Number(r.contratos))).toEqual(
          Option.some(2)
        );
        expect(pick(rows, 0, (r) => Number(r.atas))).toEqual(Option.some(2));
        const pagina2 = yield* db.execute(
          sql`select count(*)::int as count from contrato
            where ni_fornecedor = '98765432000155'`
        ).pipe(Effect.map(({ rows }) => rows));
        expect(pick(pagina2, 0, (r) => Number(r.count))).toEqual(
          Option.some(1)
        );
      }),
  );

  it.effect(
    "buscarPncp floats the lexical match and honours the uf filter",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const hits = yield* pncp.buscarPncp({
          termo: "notebooks",
          tipo: "contratacao",
        });
        expect(pick(hits, 0, (h) => h.numeroControlePNCP)).toEqual(
          Option.some("00000000000191-1-000001/2026")
        );
        expect(
          Option.zipWith(
            pick(hits, 0, (h) => Number(h.score)),
            pick(hits, 1, (h) => Number(h.score)),
            (top, next) => top > next
          )
        ).toEqual(Option.some(true));

        const semLexical = yield* pncp.buscarPncp({
          termo: "zzzz inexistente xpto",
          tipo: "contratacao",
        });
        expect(semLexical.length).toBeGreaterThan(0);

        const narrowed = yield* pncp.buscarPncp({
          termo: "notebooks",
          tipo: "contratacao",
          uf: "SP",
        });
        expect(Arr.every(narrowed, (row) => row.ufSigla === "SP")).toBe(true);
        expect(narrowed.length).toBe(1);
      }),
  );

  it.effect(
    "buscarPncp per tipo and merged todas",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const contrato = yield* pncp.buscarPncp({
          termo: "notebooks",
          tipo: "contrato",
        });
        expect(Arr.every(contrato, (row) => row.tipo === "contrato")).toBe(true);

        const ata = yield* pncp.buscarPncp({ termo: "notebooks", tipo: "ata" });
        expect(Arr.every(ata, (row) => row.tipo === "ata")).toBe(true);

        const todas = yield* pncp.buscarPncp({
          termo: "notebooks",
          tipo: "todas",
        });
        const tipos = Arr.map(todas, (row) => row.tipo);
        expect(Arr.contains(tipos, "contratacao")).toBe(true);
        expect(Arr.contains(tipos, "contrato")).toBe(true);
        expect(Arr.contains(tipos, "ata")).toBe(true);
      }),
  );

  it.effect(
    "fornecedorPncpPorNome ranks bm25 then falls back to trgm typos",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const lexical = yield* pncp.fornecedorPncpPorNome("quantum solucoes");
        expect(
          pick(lexical, 0, (r) => r.nomeRazaoSocialFornecedor)
        ).toEqual(Option.some("Tecnologia Quantum Solucoes LTDA"));
        expect(pick(lexical, 0, (r) => Number(r.score) < 0)).toEqual(
          Option.some(true)
        );

        const typo = yield* pncp.fornecedorPncpPorNome("quantun");
        expect(
          Arr.map(typo, (row) => row.nomeRazaoSocialFornecedor)
        ).toContain("Tecnologia Quantum Solucoes LTDA");
        expect(pick(typo, 0, (r) => Number(r.score) > 0)).toEqual(
          Option.some(true)
        );

        const missing = yield* Effect.flip(pncp.fornecedorPncpPorNome("  "));
        expect(missing._tag).toBe("PncpError");
        expect(missing.message).toContain("fornecedor");
      }),
  );

  it.effect(
    "contratosDoFornecedor matches the masked ni exactly",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const rows = yield* pncp.contratosDoFornecedor({
          niFornecedor: "12.345.678/0001-90",
        });
        expect(rows.length).toBe(1);
        expect(pick(rows, 0, (r) => r.niFornecedor)).toEqual(
          Option.some("12345678000190")
        );
        expect(pick(rows, 0, (r) => r.nomeRazaoSocialFornecedor)).toEqual(
          Option.some("Tecnologia Quantum Solucoes LTDA")
        );

        const missing = yield* Effect.flip(
          pncp.contratosDoFornecedor({ niFornecedor: "abc" })
        );
        expect(missing._tag).toBe("PncpError");
        expect(missing.message).toContain("CNPJ");
      }),
  );

  it.effect(
    "alertasPncp returns recent contratacoes filtered by uf and date",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const all = yield* pncp.alertasPncp({});
        expect(all.length).toBe(2);
        expect(pick(all, 0, (r) => r.dataPublicacaoPncp)).toEqual(
          Option.some("2026-01-15")
        );

        const filtered = yield* pncp.alertasPncp({
          uf: "PR",
          dataInicial: "2026-01-12",
        });
        expect(filtered.length).toBe(1);
        expect(pick(filtered, 0, (r) => r.ufSigla)).toEqual(Option.some("PR"));
      }),
  );
});
