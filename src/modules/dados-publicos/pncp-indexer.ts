/**
 * Indexer offline do PNCP (key "pncp-bulk", storage sqlite, heavy=true).
 *
 * build() faz o HARVEST de verdade da API de Consulta v1 paginada (a mesma que
 * o modulo dados-publicos ja consome online) e grava em SQLite + FTS5:
 *   - contratacoes/publicacao: loop nas modalidades 1..14 (parametro
 *     codigoModalidadeContratacao OBRIGATORIO) x janela de datas;
 *   - /contratos e /atas: so janela de datas.
 *
 * O download real so acontece quando o usuario roda o build. O parsing e
 * mapeamento ficam em funcoes PURAS (pncp-mapper.ts) testaveis com fixtures.
 * NENHUM dado real e baixado em teste.
 */

import { Result, type Result as ResultType } from "better-result";
import dayjs from "dayjs";
import type { EvlogError } from "evlog";
import type {
  AdapterError,
  BuildOptions,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { fetchJson } from "../../core/http/download";
import { countRows, openDb, openReadonly } from "../../core/store/sqlite-store";
import { dadosPublicosErrors } from "./errors";
import {
  MODALIDADES_CONTRATACAO,
  PAGE_SIZE_MAX,
  PNCP_BULK_KEY,
  PNCP_BULK_TITULO,
  PNCP_CONSULTA_BASE_URL,
  PNCP_DB_FILE,
  PNCP_DOMINIO,
  PNCP_ENDPOINTS,
  TABELAS,
} from "./pncp-catalog";
import {
  extractPageData,
  mapAta,
  mapContratacao,
  mapContrato,
  type AtaRow,
  type ContratacaoRow,
  type ContratoRow,
} from "./pncp-mapper";
import {
  createSchema,
  insertAtas,
  insertContratacoes,
  insertContratos,
  setMeta,
} from "./pncp-store";
import { pncpDbExists, pncpDbPath } from "./pncp-service";

type PncpBuildScope = {
  /** Data inicial AAAAMMDD (default: 1o de janeiro do ANO CORRENTE - ver default-2026). */
  dataInicial?: string;
  /** Data final AAAAMMDD (default: hoje, dentro do ano corrente). */
  dataFinal?: string;
  /** Recorte de anos da CLI (--anos). Sobrepoe o default do ano corrente. */
  anos?: number[];
  /** Recorte de mes da CLI (--mes, formato YYYY-MM). Sobrepoe o default. */
  mes?: string;
  /** Recorte de UFs da CLI (--ufs). Sobrepoe o default (sem filtro de UF). */
  ufs?: string[];
  /** Subconjunto de codigoModalidadeContratacao (default: 1..14). */
  modalidades?: number[];
  /** Entidades a harvestar (default: todas). */
  entidades?: ("contratacoes" | "contratos" | "atas")[];
  /** Maximo de paginas por (entidade, modalidade) - guarda anti-runaway. */
  maxPaginas?: number;
  /** Tamanho de pagina (10..50). */
  tamanhoPagina?: number;
};

const userAgent =
  "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)";

export const pncpBulkIndexAdapter: IndexAdapter = {
  key: PNCP_BULK_KEY,
  titulo: PNCP_BULK_TITULO,
  storage: "sqlite",
  requiresHeavyDownload: true,

  async build(
    opts?: BuildOptions,
  ): Promise<ResultType<BuildSummary, AdapterError>> {
    const scope = (opts?.scope ?? {}) as PncpBuildScope;
    const range = resolveRange(scope);
    const modalidades = scope.modalidades?.length
      ? scope.modalidades
      : [...MODALIDADES_CONTRATACAO];
    const entidades = scope.entidades?.length
      ? scope.entidades
      : (["contratacoes", "contratos", "atas"] as const);
    // Recorte de UFs do --ufs; vazio = sem filtro de UF (default). A API de
    // Consulta v1 so aceita o parametro uf no endpoint contratacoes/publicacao.
    const ufs = resolveUfs(scope);
    const ufLoop = ufs.length > 0 ? ufs : [undefined];
    const tamanhoPagina = clampPageSize(scope.tamanhoPagina);
    const maxPaginas = scope.maxPaginas ?? Number.POSITIVE_INFINITY;
    const progress = opts?.onProgress ?? (() => {});

    const db = openDb(PNCP_DOMINIO, PNCP_DB_FILE);
    createSchema(db);

    let totalContratacoes = 0;
    let totalContratos = 0;
    let totalAtas = 0;

    if (entidades.includes("contratacoes")) {
      for (const modalidade of modalidades) {
        for (const uf of ufLoop) {
          progress(
            `contratacoes modalidade=${modalidade}${uf ? ` uf=${uf}` : ""} ${range.dataInicial}-${range.dataFinal}`,
          );
          const harvested = await harvestEntidade(
            PNCP_ENDPOINTS.contratacoes,
            {
              dataInicial: range.dataInicial,
              dataFinal: range.dataFinal,
              codigoModalidadeContratacao: modalidade,
              uf,
              tamanhoPagina,
            },
            maxPaginas,
            (rows) => {
              const mapped = mapRows(rows, mapContratacao) as ContratacaoRow[];
              insertContratacoes(db, mapped);
              totalContratacoes += mapped.length;
            },
          );
          if (Result.isError(harvested)) return harvested;
        }
      }
    }

    if (entidades.includes("contratos")) {
      progress(`contratos ${range.dataInicial}-${range.dataFinal}`);
      const harvested = await harvestEntidade(
        PNCP_ENDPOINTS.contratos,
        {
          dataInicial: range.dataInicial,
          dataFinal: range.dataFinal,
          tamanhoPagina,
        },
        maxPaginas,
        (rows) => {
          const mapped = mapRows(rows, mapContrato) as ContratoRow[];
          insertContratos(db, mapped);
          totalContratos += mapped.length;
        },
      );
      if (Result.isError(harvested)) return harvested;
    }

    if (entidades.includes("atas")) {
      progress(`atas ${range.dataInicial}-${range.dataFinal}`);
      const harvested = await harvestEntidade(
        PNCP_ENDPOINTS.atas,
        {
          dataInicial: range.dataInicial,
          dataFinal: range.dataFinal,
          tamanhoPagina,
        },
        maxPaginas,
        (rows) => {
          const mapped = mapRows(rows, mapAta) as AtaRow[];
          insertAtas(db, mapped);
          totalAtas += mapped.length;
        },
      );
      if (Result.isError(harvested)) return harvested;
    }

    const atualizadoEm = dayjs().toISOString();
    setMeta(db, "atualizadoEm", atualizadoEm);
    setMeta(db, "dataInicial", range.dataInicial);
    setMeta(db, "dataFinal", range.dataFinal);

    const registros =
      countRows(db, TABELAS.contratacao) +
      countRows(db, TABELAS.contrato) +
      countRows(db, TABELAS.ata);

    return Result.ok({
      dominio: PNCP_DOMINIO,
      registros,
      atualizadoEm,
      caminho: pncpDbPath(),
      detalhes: {
        janela: range,
        modalidades,
        entidades,
        ufs: ufs.length > 0 ? ufs : null,
        inseridos: {
          contratacoes: totalContratacoes,
          contratos: totalContratos,
          atas: totalAtas,
        },
      },
    });
  },

  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const existe = pncpDbExists();

    if (!existe) {
      return Result.ok({
        key: PNCP_BULK_KEY,
        titulo: PNCP_BULK_TITULO,
        storage: "sqlite",
        requiresHeavyDownload: true,
        existe: false,
        atualizadoEm: null,
        registros: null,
        caminho: pncpDbPath(),
      });
    }

    return Result.try({
      try: () => {
        const db = openReadonly(PNCP_DOMINIO, PNCP_DB_FILE);
        const meta = db
          .query(`SELECT valor FROM pncp_meta WHERE chave = 'atualizadoEm'`)
          .get() as { valor: string } | null;
        const registros =
          countRows(db, TABELAS.contratacao) +
          countRows(db, TABELAS.contrato) +
          countRows(db, TABELAS.ata);

        return {
          key: PNCP_BULK_KEY,
          titulo: PNCP_BULK_TITULO,
          storage: "sqlite" as const,
          requiresHeavyDownload: true,
          existe: true,
          atualizadoEm: meta?.valor ?? null,
          registros,
          caminho: pncpDbPath(),
        };
      },
      catch: (cause): EvlogError =>
        dadosPublicosErrors.STATUS_LEITURA({
          internal: { cause: String(cause) },
        }),
    });
  },
};

// ---------------------------------------------------------------------------
// Harvest helpers
// ---------------------------------------------------------------------------

type PncpPageEnvelope = {
  data?: unknown;
  totalPaginas?: number;
  paginasRestantes?: number;
};

/**
 * Pagina um endpoint da API de Consulta v1 ate esgotar (paginasRestantes 0,
 * passar de totalPaginas, ou pagina vazia), chamando onPage com os registros
 * crus de cada pagina. NAO mapeia nem grava aqui (a injecao de onPage faz isso).
 */
async function harvestEntidade(
  path: string,
  baseParams: Record<string, unknown>,
  maxPaginas: number,
  onPage: (rows: Record<string, unknown>[]) => void,
): Promise<ResultType<number, EvlogError>> {
  let pagina = 1;
  let paginasObtidas = 0;

  while (pagina <= maxPaginas) {
    const url = buildUrl(path, { ...baseParams, pagina });
    const fetched = await fetchJson<PncpPageEnvelope>(
      url,
      { headers: { accept: "application/json", "user-agent": userAgent } },
      { retries: 4, timeoutMs: 30_000 },
    );

    if (Result.isError(fetched)) {
      // 204/sem registros pode vir como HTTP 4xx em alguns periodos vazios.
      // Embrulhamos o EvlogError de transporte do core no erro de harvest do
      // dominio, preservando a causa original em internal.
      return Result.err(
        dadosPublicosErrors.HARVEST_FALHOU({
          url,
          internal: { cause: fetched.error.message },
        }),
      );
    }

    const page = extractPageData(fetched.value);
    if (page.data.length === 0) break;

    onPage(page.data);
    paginasObtidas += 1;

    const semMais =
      page.paginasRestantes === 0 ||
      (page.totalPaginas !== null && pagina >= page.totalPaginas);
    if (semMais) break;

    pagina += 1;
  }

  return Result.ok(paginasObtidas);
}

function buildUrl(path: string, params: Record<string, unknown>): string {
  const url = new URL(path, `${PNCP_CONSULTA_BASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function mapRows<T>(
  rows: Record<string, unknown>[],
  mapper: (raw: Record<string, unknown>) => T | null,
): T[] {
  const out: T[] = [];
  for (const raw of rows) {
    const mapped = mapper(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Resolve a janela de datas do harvest seguindo o DEFAULT-2026.
 *
 * Precedencia (do mais especifico ao default):
 *   1. dataInicial/dataFinal explicitas (AAAAMMDD) - controle fino.
 *   2. --mes (YYYY-MM): mes inteiro daquele mes.
 *   3. --anos: ano(s) recortados; usamos 1o de janeiro do menor ano ate o fim
 *      (ou hoje, se o maior ano for o ano corrente) do maior ano.
 *   4. DEFAULT-2026: SEM flags de escopo, indexa SOMENTE o ANO CORRENTE -
 *      janela de 1o de janeiro do ano corrente ate HOJE. O ano corrente vem
 *      de new Date().getFullYear() em RUNTIME (permitido), nunca hardcoded.
 */
function resolveRange(scope: PncpBuildScope): {
  dataInicial: string;
  dataFinal: string;
} {
  // (1) Datas explicitas sobrepoem tudo.
  if (isValidPncpDate(scope.dataInicial) && isValidPncpDate(scope.dataFinal)) {
    return {
      dataInicial: scope.dataInicial as string,
      dataFinal: scope.dataFinal as string,
    };
  }

  const hoje = dayjs();
  const anoCorrente = new Date().getFullYear();

  // (2) --mes (YYYY-MM): janela do mes inteiro.
  if (typeof scope.mes === "string" && /^\d{4}-\d{2}$/.test(scope.mes)) {
    const inicioMes = dayjs(`${scope.mes}-01`, "YYYY-MM-DD");
    return {
      dataInicial: inicioMes.startOf("month").format("YYYYMMDD"),
      dataFinal: inicioMes.endOf("month").format("YYYYMMDD"),
    };
  }

  // (3) --anos: do 1o de janeiro do menor ano ao fim do maior ano (ou hoje, se
  // o maior ano for o ano corrente).
  const anosValidos = (scope.anos ?? []).filter((ano) => Number.isFinite(ano));
  if (anosValidos.length > 0) {
    const menorAno = Math.min(...anosValidos);
    const maiorAno = Math.max(...anosValidos);
    const dataFinal =
      maiorAno >= anoCorrente
        ? hoje.format("YYYYMMDD")
        : dayjs(`${maiorAno}-12-31`, "YYYY-MM-DD").format("YYYYMMDD");
    return {
      dataInicial: dayjs(`${menorAno}-01-01`, "YYYY-MM-DD").format("YYYYMMDD"),
      dataFinal,
    };
  }

  // (4) DEFAULT-2026: ano corrente inteiro ate hoje.
  return {
    dataInicial: dayjs(`${anoCorrente}-01-01`, "YYYY-MM-DD").format("YYYYMMDD"),
    dataFinal: hoje.format("YYYYMMDD"),
  };
}

/** Normaliza o recorte de UFs do escopo (vazio = sem filtro de UF). */
function resolveUfs(scope: PncpBuildScope): string[] {
  return (scope.ufs ?? [])
    .map((uf) => uf.trim().toUpperCase())
    .filter((uf) => uf.length === 2);
}

function isValidPncpDate(value: string | undefined): boolean {
  return typeof value === "string" && /^\d{8}$/.test(value);
}

function clampPageSize(value?: number): number {
  return Math.min(Math.max(value ?? 50, 10), PAGE_SIZE_MAX);
}
