import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db } from "../../src/kernel/db/client";
import { Pncp, PncpLive } from "../../src/sources/pncp/store";
import { EmbedderStub } from "./support/embedder-stub";
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

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const pagina = url.searchParams.get("pagina") ?? "1";
  const modalidade = url.searchParams.get("codigoModalidadeContratacao");
  const payload = url.pathname.includes("contratacoes/publicacao")
    ? pagina === "1" && modalidade === "6"
      ? { data: contratacoes, totalPaginas: 1 }
      : { data: [], totalPaginas: 1 }
    : url.pathname.endsWith("/contratos")
      ? pagina === "1"
        ? { data: [contratos[0]], totalPaginas: 2 }
        : pagina === "2"
          ? { data: [contratos[1]], totalPaginas: 2 }
          : { data: [], totalPaginas: 2 }
      : url.pathname.endsWith("/atas")
        ? pagina === "1"
          ? { data: atas, totalPaginas: 1 }
          : { data: [], totalPaginas: 1 }
        : null;
  return payload === null
    ? new Response("rota desconhecida", { status: 404 })
    : Response.json(payload);
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  PncpLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub))),
  TestDbLive,
  EmbedderStub,
  HttpStub
);

const scope = {
  dataInicial: "20260101",
  dataFinal: "20260131",
  modalidades: [6, 8],
} as const;

const seeded = Effect.gen(function* () {
  const pncp = yield* Pncp;
  yield* pncp.indexScope(scope);
  return pncp;
});

describe("pncp store + paginated harvest + hybrid RRF", () => {
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
        );
        expect(Number(rows[0].contratacoes)).toBe(2);
        expect(Number(rows[0].contratos)).toBe(2);
        expect(Number(rows[0].atas)).toBe(2);
        const pagina2 = yield* db.execute(
          sql`select count(*)::int as count from contrato
            where ni_fornecedor = '98765432000155'`
        );
        expect(Number(pagina2[0].count)).toBe(1);
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
        expect(hits[0].numeroControlePNCP).toBe(
          "00000000000191-1-000001/2026"
        );
        expect(Number(hits[0].score)).toBeGreaterThan(Number(hits[1].score));

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
        expect(narrowed.every((row) => row.ufSigla === "SP")).toBe(true);
        expect(narrowed.length).toBe(1);
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
        expect(contrato.every((row) => row.tipo === "contrato")).toBe(true);

        const ata = yield* pncp.buscarPncp({ termo: "notebooks", tipo: "ata" });
        expect(ata.every((row) => row.tipo === "ata")).toBe(true);

        const todas = yield* pncp.buscarPncp({
          termo: "notebooks",
          tipo: "todas",
        });
        const tipos = new Set(todas.map((row) => row.tipo));
        expect(tipos.has("contratacao")).toBe(true);
        expect(tipos.has("contrato")).toBe(true);
        expect(tipos.has("ata")).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "fornecedorPncpPorNome ranks bm25 then falls back to trgm typos",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const lexical = yield* pncp.fornecedorPncpPorNome("quantum solucoes");
        expect(lexical[0].nomeRazaoSocialFornecedor).toBe(
          "Tecnologia Quantum Solucoes LTDA"
        );
        expect(Number(lexical[0].score)).toBeLessThan(0);

        const typo = yield* pncp.fornecedorPncpPorNome("quantun");
        expect(
          typo.map((row) => row.nomeRazaoSocialFornecedor)
        ).toContain("Tecnologia Quantum Solucoes LTDA");
        expect(Number(typo[0].score)).toBeGreaterThan(0);

        const missing = yield* Effect.flip(pncp.fornecedorPncpPorNome("  "));
        expect(missing._tag).toBe("PncpError");
        expect(missing.message).toContain("fornecedor");
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
        expect(rows[0].niFornecedor).toBe("12345678000190");
        expect(rows[0].nomeRazaoSocialFornecedor).toBe(
          "Tecnologia Quantum Solucoes LTDA"
        );

        const missing = yield* Effect.flip(
          pncp.contratosDoFornecedor({ niFornecedor: "abc" })
        );
        expect(missing._tag).toBe("PncpError");
        expect(missing.message).toContain("CNPJ");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "alertasPncp returns recent contratacoes filtered by uf and date",
    () =>
      Effect.gen(function* () {
        const pncp = yield* seeded;
        const all = yield* pncp.alertasPncp({});
        expect(all.length).toBe(2);
        expect(all[0].dataPublicacaoPncp).toBe("2026-01-15");

        const filtered = yield* pncp.alertasPncp({
          uf: "PR",
          dataInicial: "2026-01-12",
        });
        expect(filtered.length).toBe(1);
        expect(filtered[0].ufSigla).toBe("PR");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
