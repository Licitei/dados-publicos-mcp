import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { dominioPath } from "../dataDir";

const defaultFile = "index.sqlite";

/**
 * Singleton de conexoes: cada arquivo SQLite e aberto UMA vez por processo
 * (por modo ro/rw) e reusado em todas as chamadas. Nao ha close por chamada —
 * o processo detem o ciclo de vida (ver closeAllDbs e o hook de saida no
 * entrypoint). Nenhum dominio apaga o arquivo .db (rebuild e in-place: DELETE
 * FROM / CREATE TABLE IF NOT EXISTS), entao o handle de longa duracao e seguro.
 */
const cache = new Map<string, Database>();

/** Abre o banco UMA vez por (caminho, modo) e reusa o handle no processo. */
export function getDb(
  absPath: string,
  opts?: { readonly?: boolean },
): Database {
  const readonly = opts?.readonly === true;
  const key = `${absPath}::${readonly ? "ro" : "rw"}`;
  const cached = cache.get(key);

  if (cached) return cached;

  if (!readonly) mkdirSync(dirname(absPath), { recursive: true });

  const db = new Database(
    absPath,
    readonly ? { readonly: true } : { create: true },
  );

  if (!readonly) {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }

  cache.set(key, db);

  return db;
}

/**
 * Abre (criando se necessario, modo rw) o banco SQLite do dominio. Singleton:
 * reusa o handle pelo processo, sem close por chamada.
 */
export function openDb(dominio: string, file?: string): Database {
  return getDb(dominioPath(dominio, file ?? defaultFile));
}

/**
 * Abre (somente leitura) o banco SQLite do dominio. Singleton. Lanca se o
 * arquivo nao existe — proteja com dbExists antes (erro INDICE_AUSENTE).
 */
export function openReadonly(dominio: string, file?: string): Database {
  return getDb(dominioPath(dominio, file ?? defaultFile), { readonly: true });
}

/** Fecha e esquece todos os bancos do cache (hook de saida do processo / testes). */
export function closeAllDbs(): void {
  for (const db of cache.values()) db.close();

  cache.clear();
}

/**
 * Insere linhas em lote dentro de uma unica transacao.
 * sql deve ser um INSERT preparavel; bind mapeia cada linha para os valores.
 */
export function batchInsert<T>(
  db: Database,
  sql: string,
  rows: T[],
  bind: (row: T) => unknown[],
  batch = 1_000,
): void {
  if (rows.length === 0) return;

  const statement = db.prepare(sql);
  const insertChunk = db.transaction((chunk: T[]) => {
    for (const row of chunk) {
      statement.run(...(bind(row) as never[]));
    }
  });

  for (let i = 0; i < rows.length; i += batch) {
    insertChunk(rows.slice(i, i + batch));
  }
}

/** Conta linhas de uma tabela. */
export function countRows(db: Database, table: string): number {
  const row = db.query(`SELECT COUNT(*) AS total FROM "${table}"`).get() as {
    total: number;
  } | null;

  return row?.total ?? 0;
}

/** Indica se o arquivo SQLite do dominio ja existe em disco (bun-native, sync). */
export function dbExists(dominio: string, file?: string): boolean {
  return Bun.file(dominioPath(dominio, file ?? defaultFile)).size > 0;
}
