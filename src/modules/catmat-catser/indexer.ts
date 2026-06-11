/**
 * Indexador da fonte CATMAT/CATSER.
 *
 * build(): pagina a API REST (keyless), mapeia para linhas e grava no SQLite
 * (openDb/batchInsert), criando indices secundarios e FTS5. Sem bulk-download:
 * o legado compras.dados.gov.br esta morto (301->404), entao paginamos.
 *
 * Expoe legislacao-style: catmatCatserIndexAdapter (IndexAdapter, storage
 * 'sqlite', requiresHeavyDownload false).
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
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
import { fetchWithRetry } from "../../core/http/download";
import {
  countRows,
  dbExists,
  openDb,
} from "../../core/store/sqlite-store";
import { dominioPath } from "../../core/dataDir";
import {
  DB_FILE,
  DOMINIO,
  ENDPOINTS,
  KEY,
  PAGE_SIZE,
  TITULO,
  pageUrl,
} from "./catalog";
import {
  mapCatmatItem,
  mapCatserItem,
  type PaginatedResponse,
  type RawCatmatClasse,
  type RawCatmatGrupo,
  type RawCatmatItem,
  type RawCatmatPdm,
  type RawCatserItem,
} from "./schema";
import {
  createSchema,
  getMetadata,
  insertCatmatClasses,
  insertCatmatGrupos,
  insertCatmatItens,
  insertCatmatPdms,
  insertCatserItens,
  rebuildFts,
  resetTables,
  setMetadata,
} from "./store";
import { catmatCatserErrors } from "./errors";

/**
 * Erros do dominio CATMAT/CATSER agora sao EvlogError do catalogo `catmat-catser`
 * (estilo dfe-kit/evlog). Alias mantido para compatibilidade dos consumidores.
 */
export type CatmatIndexError = EvlogError;

const httpHeaders = {
  accept: "application/json",
} as const;

/** Pequeno delay entre paginas para nao throttlar o Azure Front Door. */
const PAGE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pagina um endpoint ate esgotar paginasRestantes, chamando onPage para cada
 * lote. Retorna o total de registros processados.
 */
async function paginate<T>(
  endpoint: string,
  onPage: (rows: T[]) => void,
  opts?: BuildOptions
): Promise<ResultType<number, EvlogError>> {
  let pagina = 1;
  let total = 0;

  for (;;) {
    const url = pageUrl(endpoint, pagina, PAGE_SIZE);

    const fetched = await Result.tryPromise({
      try: async () => {
        const response = await fetchWithRetry(url, { headers: httpHeaders });

        return (await response.json()) as PaginatedResponse<T>;
      },
      catch: (cause): EvlogError =>
        catmatCatserErrors.FETCH({ url, internal: { cause: String(cause) } }),
    });

    if (Result.isError(fetched)) return Result.err(fetched.error);

    const body = fetched.value;
    const rows = Array.isArray(body?.resultado) ? body.resultado : [];

    onPage(rows);
    total += rows.length;

    opts?.onProgress?.(
      `${endpoint.split("/").pop()}: pagina ${pagina}/${
        body?.totalPaginas ?? "?"
      } (${total} registros)`
    );

    const restantes = body?.paginasRestantes ?? 0;

    if (restantes <= 0 || rows.length === 0) break;

    pagina += 1;
    await sleep(PAGE_DELAY_MS);
  }

  return Result.ok(total);
}

/** Caminho do banco SQLite em disco. */
export function dbPath(): string {
  return dominioPath(DOMINIO, DB_FILE);
}

async function build(
  opts?: BuildOptions
): Promise<ResultType<BuildSummary, AdapterError>> {
  const db = openDb(DOMINIO, DB_FILE);

  try {
    createSchema(db);
    resetTables(db);

    // 1. Hierarquia de material (leve).
    const grupos = await paginate<RawCatmatGrupo>(
      ENDPOINTS.catmatGrupo,
      (rows) => insertCatmatGrupos(db, rows),
      opts
    );

    if (Result.isError(grupos)) return Result.err(grupos.error);

    const classes = await paginate<RawCatmatClasse>(
      ENDPOINTS.catmatClasse,
      (rows) => insertCatmatClasses(db, rows),
      opts
    );

    if (Result.isError(classes)) return Result.err(classes.error);

    const pdms = await paginate<RawCatmatPdm>(
      ENDPOINTS.catmatPdm,
      (rows) => insertCatmatPdms(db, rows),
      opts
    );

    if (Result.isError(pdms)) return Result.err(pdms.error);

    // 2. Itens de servico (CATSER, ~3 mil).
    const servicos = await paginate<RawCatserItem>(
      ENDPOINTS.catserItem,
      (rows) => insertCatserItens(db, rows.map(mapCatserItem)),
      opts
    );

    if (Result.isError(servicos)) return Result.err(servicos.error);

    // 3. Itens de material (CATMAT, ~342 mil; pesado mas a fonte e pequena).
    const materiais = await paginate<RawCatmatItem>(
      ENDPOINTS.catmatItem,
      (rows) => insertCatmatItens(db, rows.map(mapCatmatItem)),
      opts
    );

    if (Result.isError(materiais)) return Result.err(materiais.error);

    rebuildFts(db);

    const atualizadoEm = dayjs().toISOString();
    const totalItens = materiais.value + servicos.value;

    setMetadata(db, "atualizadoEm", atualizadoEm);
    setMetadata(db, "catmatItens", String(materiais.value));
    setMetadata(db, "catserItens", String(servicos.value));

    return Result.ok({
      dominio: DOMINIO,
      registros: totalItens,
      atualizadoEm,
      caminho: dbPath(),
      detalhes: {
        catmatItens: materiais.value,
        catserItens: servicos.value,
        catmatGrupos: grupos.value,
        catmatClasses: classes.value,
        catmatPdms: pdms.value,
      },
    });
  } finally {
    db.close();
  }
}

async function status(): Promise<ResultType<StatusInfo, AdapterError>> {
  const caminho = dbPath();
  const existe = dbExists(DOMINIO, DB_FILE) || existsSync(caminho);

  if (!existe) {
    return Result.ok({
      key: KEY,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: false,
      atualizadoEm: null,
      registros: null,
      caminho,
    });
  }

  const db = openDb(DOMINIO, DB_FILE);

  try {
    const registros =
      countRows(db, "catmat_item") + countRows(db, "catser_item");
    const atualizadoEm = getMetadata(db, "atualizadoEm");

    return Result.ok({
      key: KEY,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: true,
      atualizadoEm,
      registros,
      caminho,
    });
  } finally {
    db.close();
  }
}

export const catmatCatserIndexAdapter: IndexAdapter = {
  key: KEY,
  titulo: TITULO,
  storage: "sqlite",
  requiresHeavyDownload: false,
  build,
  status,
};

/** Abre o banco em disco para leitura (usado pelas tools). */
export function openCatmatCatserDb(): Database {
  return openDb(DOMINIO, DB_FILE);
}
