import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { dominioPath } from "../dataDir";

const defaultFile = "index.sqlite";

/**
 * Abre (criando se necessario) o banco SQLite do dominio.
 * Garante o diretorio e configura WAL + synchronous NORMAL.
 */
export function openDb(dominio: string, file?: string): Database {
  const path = dominioPath(dominio, file ?? defaultFile);

  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path, { create: true });

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  return db;
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
  batch = 1_000
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
  const row = db
    .query(`SELECT COUNT(*) AS total FROM "${table}"`)
    .get() as { total: number } | null;

  return row?.total ?? 0;
}

/** Indica se o arquivo SQLite do dominio ja existe em disco. */
export function dbExists(dominio: string, file?: string): boolean {
  return existsSync(dominioPath(dominio, file ?? defaultFile));
}
