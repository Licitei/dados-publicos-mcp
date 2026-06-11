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
import { openDb } from "../../core/store/sqlite-store";
import {
  ATIVO_VALUES,
  buildPageUrl,
  DB_FILE,
  DOMINIO,
  KEY,
  TAMANHO_PAGINA_MAX,
  TITULO,
} from "./catalog";
import { sicafErrors } from "./errors";
import { statusSicaf } from "./service";
import {
  createSchema,
  insertFornecedores,
  mapFornecedor,
  resetTable,
  totalFornecedores,
  type FornecedorPage,
} from "./store";

export type SicafIndexError = EvlogError;

const TITULO_ADAPTER = TITULO;

/**
 * Limite de paginas por flag de `ativo` numa varredura. Em producao a fonte
 * tem ~1627 paginas (ativos) + ~260 (inativos) a 500/pagina. Mantemos um teto
 * alto como guarda-corpo; pode ser reduzido via opts.scope.maxPaginas.
 */
const HARD_PAGE_CAP = 5_000;

export const sicafFornecedoresIndexAdapter: IndexAdapter = {
  key: KEY,
  titulo: TITULO_ADAPTER,
  storage: "sqlite",
  requiresHeavyDownload: false,
  async build(opts?: BuildOptions): Promise<ResultType<BuildSummary, AdapterError>> {
    const built = await indexarSicaf(opts);

    if (Result.isError(built)) return Result.err(built.error);

    return Result.ok(built.value);
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const status = statusSicaf();

    return Result.ok({
      key: KEY,
      titulo: TITULO_ADAPTER,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: status.existe,
      atualizadoEm: status.atualizadoEm,
      registros: status.registros,
      caminho: status.caminho,
    });
  },
};

/**
 * Baixa uma unica pagina da API (testavel/injetavel a parte).
 */
async function fetchPage(opts: {
  pagina: number;
  ativo: boolean;
  tamanhoPagina: number;
}): Promise<ResultType<FornecedorPage, SicafIndexError>> {
  return Result.gen(async function* () {
    const url = buildPageUrl(opts);
    const json = await fetchJson<FornecedorPage>(url);

    if (Result.isError(json)) {
      return yield* Result.err(
        sicafErrors.FONTE_DOWNLOAD({
          pagina: opts.pagina,
          ativo: opts.ativo,
          internal: { url, cause: json.error.message, status: json.error.status },
        })
      );
    }

    const page = json.value;

    if (!page || !Array.isArray(page.resultado)) {
      return yield* Result.err(
        sicafErrors.FONTE_INVALIDA({
          pagina: opts.pagina,
          ativo: opts.ativo,
          internal: { url },
        })
      );
    }

    return Result.ok(page);
  });
}

/**
 * Varredura completa: itera ativo=true e ativo=false, pagina por pagina,
 * gravando lotes no SQLite. Recria o schema e limpa a tabela antes.
 */
export async function indexarSicaf(
  opts?: BuildOptions
): Promise<ResultType<BuildSummary, SicafIndexError>> {
  const scope = opts?.scope ?? {};
  const tamanhoPagina = clampScopeNumber(scope.tamanhoPagina, TAMANHO_PAGINA_MAX);
  const maxPaginas = clampScopeNumber(scope.maxPaginas, HARD_PAGE_CAP);
  const onProgress = opts?.onProgress;

  const db = openDb(DOMINIO, DB_FILE);

  try {
    createSchema(db);
    resetTable(db);

    for (const ativo of ATIVO_VALUES) {
      let pagina = 1;
      let totalPaginas = Infinity;

      while (pagina <= totalPaginas && pagina <= maxPaginas) {
        const page = await fetchPage({ pagina, ativo, tamanhoPagina });

        if (Result.isError(page)) {
          db.close();

          return Result.err(page.error);
        }

        if (Number.isFinite(page.value.totalPaginas)) {
          totalPaginas = page.value.totalPaginas;
        }

        const records = page.value.resultado.map(mapFornecedor);

        insertFornecedores(db, records);

        onProgress?.(
          `SICAF ativo=${ativo} pagina ${pagina}/${
            Number.isFinite(totalPaginas) ? totalPaginas : "?"
          } (+${records.length})`
        );

        if (records.length === 0) break;

        pagina += 1;
      }
    }

    const registros = totalFornecedores(db);
    const atualizadoEm = dayjs().toISOString();
    const caminho = db.filename;

    return Result.ok({
      dominio: DOMINIO,
      registros,
      atualizadoEm,
      caminho,
      detalhes: { tamanhoPagina },
    });
  } finally {
    db.close();
  }
}

function clampScopeNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.trunc(value);
}
