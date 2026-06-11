import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import {
  BRASIL_API_BASE_URL,
  MINHA_RECEITA_BASE_URL,
  PNCP_BASE_URL,
  PNCP_CONSULTA_BASE_URL,
  fetchPublicJson,
} from "./client";
import { dadosPublicosErrors } from "./errors";
import {
  asArray,
  assertPncpDate,
  defaultDateRange,
  filterByKeyword,
  normalizeCnpj,
  pageData,
  resolvePncpId,
  splitDateBuckets,
  sumValues,
} from "./utils";

type SearchLicitacoesInput = {
  dataInicial?: string;
  dataFinal?: string;
  modalidades?: number[];
  uf?: string;
  codigoMunicipioIbge?: string;
  cnpjOrgao?: string;
  palavraChave?: string;
  valorMinimo?: number;
  valorMaximo?: number;
  pagina?: number;
  tamanhoPagina?: number;
};

type SearchContratosInput = {
  dataInicial?: string;
  dataFinal?: string;
  cnpjOrgao?: string;
  cnpjFornecedor?: string;
  palavraChave?: string;
  pagina?: number;
  tamanhoPagina?: number;
};

type SearchAtasInput = {
  dataInicial?: string;
  dataFinal?: string;
  cnpjOrgao?: string;
  palavraChave?: string;
  somenteVigentes?: boolean;
  pagina?: number;
  tamanhoPagina?: number;
};

type PncpIdInput = {
  numeroControlePNCP?: string;
  orgaoCnpj?: string;
  ano?: number;
  sequencial?: number;
};

type AtaIdInput = PncpIdInput & {
  sequencialAta: number;
  incluirItens?: boolean;
  incluirArquivos?: boolean;
};

type AggregateInput = {
  dataInicial: string;
  dataFinal: string;
  granularidade: "dia" | "semana" | "mes" | "ano";
  modalidades?: number[];
  uf?: string;
  cnpjOrgao?: string;
  tamanhoPagina?: number;
  incluirValor?: boolean;
};

const ttl5Min = 5 * 60 * 1000;
const ttl30Min = 30 * 60 * 1000;
const ttl1Hour = 60 * 60 * 1000;
const defaultModalidades = [6, 8, 9];

export async function searchLicitacoes(input: SearchLicitacoesInput) {
  return Result.gen(async function* () {
    const range = yield* resolveRange(input, 7);
    const modalidades = input.modalidades?.length
      ? input.modalidades
      : defaultModalidades;
    const pages = await Promise.all(
      modalidades.map((modalidade) =>
        consulta("contratacoes/publicacao", {
          dataInicial: range.dataInicial,
          dataFinal: range.dataFinal,
          codigoModalidadeContratacao: modalidade,
          uf: input.uf,
          codigoMunicipioIbge: input.codigoMunicipioIbge,
          cnpj: input.cnpjOrgao ? normalizeCnpj(input.cnpjOrgao) : undefined,
          pagina: input.pagina ?? 1,
          tamanhoPagina: clampPageSize(input.tamanhoPagina),
        }),
      ),
    );
    const data = [];
    let totalPncp = 0;

    for (const page of pages) {
      const value = yield* page;
      const parsedPage = pageData(value);
      data.push(...parsedPage.data);
      totalPncp += parsedPage.totalRegistros ?? 0;
    }

    const filtered = filterByValue(
      filterByKeyword(data, input.palavraChave),
      input.valorMinimo,
      input.valorMaximo,
    );

    return Result.ok({
      meta: {
        dataInicial: range.dataInicial,
        dataFinal: range.dataFinal,
        modalidades,
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
        totalRetornado: filtered.length,
        totalPncp,
        filtrosCliente: ["palavraChave", "valorMinimo", "valorMaximo"],
      },
      results: filtered,
    });
  });
}

export async function getLicitacao(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      consulta(`orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}`),
    );

    return Result.ok(value);
  });
}

export async function listLicitacaoItens(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(`orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/itens`),
    );

    return Result.ok(value);
  });
}

export async function listLicitacaoResultados(
  input: PncpIdInput & { numeroItem: number },
) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(
        `orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/itens/${input.numeroItem}/resultados`,
      ),
    );

    return Result.ok(value);
  });
}

export async function listLicitacaoArquivos(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(
        `orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/arquivos`,
      ),
    );

    return Result.ok(value);
  });
}

export async function searchContratos(input: SearchContratosInput) {
  return Result.gen(async function* () {
    const range = yield* resolveRange(input, 30);
    const value = yield* Result.await(
      consulta("contratos", {
        dataInicial: range.dataInicial,
        dataFinal: range.dataFinal,
        cnpjOrgao: input.cnpjOrgao ? normalizeCnpj(input.cnpjOrgao) : undefined,
        cnpjFornecedor: input.cnpjFornecedor
          ? normalizeCnpj(input.cnpjFornecedor)
          : undefined,
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
      }),
    );

    const page = pageData(value);

    return Result.ok({
      meta: {
        dataInicial: range.dataInicial,
        dataFinal: range.dataFinal,
        totalPncp: page.totalRegistros,
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
      },
      results: filterByKeyword(page.data, input.palavraChave),
    });
  });
}

export async function getContrato(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(`orgaos/${id.orgaoCnpj}/contratos/${id.ano}/${id.sequencial}`),
    );

    return Result.ok(value);
  });
}

export async function listContratoTermos(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(
        `orgaos/${id.orgaoCnpj}/contratos/${id.ano}/${id.sequencial}/termos`,
      ),
    );

    return Result.ok(value);
  });
}

export async function listContratoInstrumentos(input: PncpIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);

    const value = yield* Result.await(
      pncp(
        `orgaos/${id.orgaoCnpj}/contratos/${id.ano}/${id.sequencial}/instrumentocobranca`,
      ),
    );

    return Result.ok(value);
  });
}

export async function searchAtasRp(input: SearchAtasInput) {
  return Result.gen(async function* () {
    const range = yield* resolveRange(input, 30);
    const value = yield* Result.await(
      consulta("atas", {
        dataInicial: range.dataInicial,
        dataFinal: range.dataFinal,
        cnpjOrgao: input.cnpjOrgao ? normalizeCnpj(input.cnpjOrgao) : undefined,
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
      }),
    );

    const page = pageData(value);
    const filtered = filterAtasVigentes(
      filterByKeyword(page.data, input.palavraChave),
      input.somenteVigentes ?? true,
    );

    return Result.ok({
      meta: {
        dataInicial: range.dataInicial,
        dataFinal: range.dataFinal,
        somenteVigentes: input.somenteVigentes ?? true,
        totalPncp: page.totalRegistros,
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
        observacao:
          "palavraChave e somenteVigentes sao filtros aplicados sobre a pagina retornada pelo PNCP.",
      },
      results: filtered,
    });
  });
}

export async function getAtaRp(input: AtaIdInput) {
  return Result.gen(async function* () {
    const id = yield* resolvePncpId(input);
    const [ata, itens, arquivos] = await Promise.all([
      pncp(
        `orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/atas/${input.sequencialAta}`,
      ),
      input.incluirItens
        ? pncp(
            `orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/atas/${input.sequencialAta}/itens`,
          )
        : Result.ok(null),
      input.incluirArquivos
        ? pncp(
            `orgaos/${id.orgaoCnpj}/compras/${id.ano}/${id.sequencial}/atas/${input.sequencialAta}/arquivos`,
          )
        : Result.ok(null),
    ]);

    const ataValue = yield* ata;
    const itensValue = yield* itens;
    const arquivosValue = yield* arquivos;

    return Result.ok({
      ata: ataValue,
      itens: itensValue,
      arquivos: arquivosValue,
    });
  });
}

export async function getOrgao(input: { cnpj: string }) {
  return pncp(`orgaos/${normalizeCnpj(input.cnpj)}`);
}

export async function getFornecedorContratos(
  input: Omit<SearchContratosInput, "cnpjFornecedor"> & { cnpj: string },
) {
  return searchContratos({
    ...input,
    cnpjFornecedor: normalizeCnpj(input.cnpj),
  });
}

export async function searchPca(input: {
  dataInicio?: string;
  dataFim?: string;
  codigoClassificacaoSuperior?: string;
  palavraChave?: string;
  pagina?: number;
  tamanhoPagina?: number;
}) {
  return Result.gen(async function* () {
    const range = yield* resolveRange(
      {
        dataInicial: input.dataInicio,
        dataFinal: input.dataFim,
      },
      30,
    );
    const value = yield* Result.await(
      consulta("pca/atualizacao", {
        dataInicio: range.dataInicial,
        dataFim: range.dataFinal,
        codigoClassificacaoSuperior: input.codigoClassificacaoSuperior ?? "01",
        pagina: input.pagina ?? 1,
        tamanhoPagina: clampPageSize(input.tamanhoPagina),
      }),
    );

    const page = pageData(value);

    return Result.ok({
      meta: {
        dataInicio: range.dataInicial,
        dataFim: range.dataFinal,
        codigoClassificacaoSuperior: input.codigoClassificacaoSuperior ?? "01",
        totalPncp: page.totalRegistros,
      },
      results: filterByKeyword(page.data, input.palavraChave),
    });
  });
}

export async function listPcaItens(input: {
  orgaoCnpj: string;
  anoPca: number;
  sequencialPca: number;
}) {
  return pncp(
    `orgaos/${normalizeCnpj(input.orgaoCnpj)}/pca/${input.anoPca}/${input.sequencialPca}/itens`,
  );
}

export async function getCnpjData(input: { cnpj: string; provider?: string }) {
  const cnpj = normalizeCnpj(input.cnpj);
  const provider =
    input.provider === "minhareceita" ||
    process.env.CNPJ_PROVIDER === "minhareceita"
      ? "minhareceita"
      : "brasilapi";

  if (provider === "minhareceita") {
    return publicJson(MINHA_RECEITA_BASE_URL, cnpj, {}, ttl1Hour);
  }

  return publicJson(BRASIL_API_BASE_URL, `api/cnpj/v1/${cnpj}`, {}, ttl1Hour);
}

export async function aggregateLicitacoesPorPeriodo(input: AggregateInput) {
  return Result.gen(async function* () {
    yield* assertPncpDate(input.dataInicial, "dataInicial");
    yield* assertPncpDate(input.dataFinal, "dataFinal");

    const buckets = splitDateBuckets(input);
    const results = [];

    for (const bucket of buckets) {
      const value = yield* await searchLicitacoes({
        dataInicial: bucket.dataInicial,
        dataFinal: bucket.dataFinal,
        modalidades: input.modalidades,
        uf: input.uf,
        cnpjOrgao: input.cnpjOrgao,
        tamanhoPagina: input.tamanhoPagina ?? 50,
      });

      const rows = asArray((value as { results?: unknown }).results);

      results.push({
        periodo: bucket.chave,
        dataInicial: bucket.dataInicial,
        dataFinal: bucket.dataFinal,
        quantidade: rows.length,
        valor: input.incluirValor ? sumValues(rows) : undefined,
      });
    }

    return Result.ok({
      meta: {
        granularidade: input.granularidade,
        dataInicial: input.dataInicial,
        dataFinal: input.dataFinal,
        observacao:
          "Agregacao baseada nas paginas retornadas pelo PNCP; aumente tamanhoPagina ou quebre a janela para maior cobertura.",
      },
      results,
    });
  });
}

export async function comparePeriodos(input: {
  periodoA: AggregateInput;
  periodoB: AggregateInput;
}) {
  return Result.gen(async function* () {
    const [a, b] = await Promise.all([
      aggregateLicitacoesPorPeriodo(input.periodoA),
      aggregateLicitacoesPorPeriodo(input.periodoB),
    ]);

    const valueA = (yield* a) as { results: { quantidade: number }[] };
    const valueB = (yield* b) as { results: { quantidade: number }[] };
    const totalA = totalQuantidade(valueA.results);
    const totalB = totalQuantidade(valueB.results);

    return Result.ok({
      periodoA: valueA,
      periodoB: valueB,
      comparacao: {
        totalA,
        totalB,
        delta: totalB - totalA,
        deltaPercentual:
          totalA === 0 ? null : ((totalB - totalA) / totalA) * 100,
      },
    });
  });
}

function resolveRange(
  input: { dataInicial?: string; dataFinal?: string },
  fallbackDays: number,
): ResultType<{ dataInicial: string; dataFinal: string }, EvlogError> {
  return Result.gen(function* () {
    const range =
      input.dataInicial && input.dataFinal
        ? { dataInicial: input.dataInicial, dataFinal: input.dataFinal }
        : defaultDateRange(fallbackDays);

    yield* assertPncpDate(range.dataInicial, "dataInicial");
    yield* assertPncpDate(range.dataFinal, "dataFinal");

    return Result.ok(range);
  });
}

function consulta(path: string, params?: Record<string, unknown>) {
  return publicJson(PNCP_CONSULTA_BASE_URL, path, params, ttl5Min);
}

function pncp(path: string, params?: Record<string, unknown>) {
  return publicJson(PNCP_BASE_URL, path, params, ttl30Min);
}

function publicJson(
  baseUrl: string,
  path: string,
  params?: Record<string, unknown>,
  cacheTtlMs?: number,
) {
  return fetchPublicJson({
    baseUrl,
    path,
    params,
    cacheTtlMs,
  });
}

function clampPageSize(value?: number) {
  return Math.min(Math.max(value ?? 20, 10), 50);
}

function filterByValue(data: unknown[], min?: number, max?: number) {
  return data.filter((item) => {
    if (!item || typeof item !== "object")
      return min === undefined && max === undefined;

    const record = item as Record<string, unknown>;
    const value =
      record.valorTotalEstimado ??
      record.valorTotalHomologado ??
      record.valorInicial ??
      record.valorGlobal ??
      record.valorTotal;

    if (typeof value !== "number")
      return min === undefined && max === undefined;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;

    return true;
  });
}

function filterAtasVigentes(data: unknown[], enabled: boolean) {
  if (!enabled) return data;

  const today = new Date().toISOString().slice(0, 10);

  return data.filter((item) => {
    if (!item || typeof item !== "object") return false;

    const record = item as Record<string, unknown>;
    const end =
      record.dataFimVigencia ??
      record.dataVigenciaFim ??
      record.vigenciaFim ??
      record.dataFinalVigencia;

    return typeof end !== "string" || end >= today;
  });
}

function totalQuantidade(rows: { quantidade: number }[]) {
  return rows.reduce((sum, row) => sum + row.quantidade, 0);
}
