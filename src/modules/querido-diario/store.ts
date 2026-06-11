import type { Database } from "bun:sqlite";
import { batchInsert } from "../../core/store/sqlite-store";
import { conteudoParaFts, extractCnpjs, type DiarioRegistro } from "./parse";

export const DB_FILE = "querido-diario.db";

/**
 * Cria o esquema SQLite do Querido Diario num banco ja aberto.
 *
 * - diarios: 1 linha por diario (territory_id, uf, data, poder, edicao, url, conteudo)
 * - diarios_fts: indice FTS5 externo sobre o conteudo NORMALIZADO (lowercase,
 *   sem acento, tolerante ao ruido de OCR) + municipio, para busca por nome de
 *   empresa/fornecedor, objeto de licitacao, modalidade e numero de edital.
 * - diario_cnpjs: CNPJs mencionados no corpo, para busca direta por CNPJ.
 * - indices secundarios por territory_id e data para filtro municipio+periodo.
 *
 * Funcao PURA quanto a I/O de rede: opera sobre o Database recebido, portanto
 * e testavel com Database(":memory:").
 */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      territory_id TEXT NOT NULL,
      uf TEXT NOT NULL,
      municipio TEXT NOT NULL,
      ano INTEGER,
      data TEXT,
      poder TEXT,
      edicao TEXT,
      edicao_extra INTEGER NOT NULL DEFAULT 0,
      url_original TEXT,
      conteudo TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_diarios_territory ON diarios(territory_id);
    CREATE INDEX IF NOT EXISTS idx_diarios_data ON diarios(data);
    CREATE INDEX IF NOT EXISTS idx_diarios_uf_ano ON diarios(uf, ano);
    CREATE INDEX IF NOT EXISTS idx_diarios_terr_data ON diarios(territory_id, data);

    CREATE VIRTUAL TABLE IF NOT EXISTS diarios_fts USING fts5(
      conteudo,
      municipio,
      content='diarios',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TABLE IF NOT EXISTS diario_cnpjs (
      diario_id INTEGER NOT NULL,
      cnpj TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_diario_cnpjs_cnpj ON diario_cnpjs(cnpj);
    CREATE INDEX IF NOT EXISTS idx_diario_cnpjs_diario ON diario_cnpjs(diario_id);
  `);
}

const insertDiarioSql = `
  INSERT INTO diarios
    (territory_id, uf, municipio, ano, data, poder, edicao, edicao_extra, url_original, conteudo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Insere registros de diario e mantem o indice FTS e a tabela de CNPJs.
 * Devolve a quantidade inserida. O FTS armazena o conteudo NORMALIZADO para
 * casar com a query (que tambem e normalizada) — tolerante a acentos do OCR.
 */
export function insertDiarios(
  db: Database,
  registros: DiarioRegistro[],
): number {
  if (registros.length === 0) return 0;

  const insertDiario = db.prepare(insertDiarioSql);
  const insertFts = db.prepare(
    "INSERT INTO diarios_fts (rowid, conteudo, municipio) VALUES (?, ?, ?)",
  );
  const insertCnpj = db.prepare(
    "INSERT INTO diario_cnpjs (diario_id, cnpj) VALUES (?, ?)",
  );

  const tx = db.transaction((rows: DiarioRegistro[]) => {
    for (const r of rows) {
      const result = insertDiario.run(
        r.territoryId,
        r.uf,
        r.municipio,
        r.ano,
        r.data,
        r.poder,
        r.edicao,
        r.edicaoExtra ? 1 : 0,
        r.urlOriginal,
        r.conteudo,
      );
      const id = Number(result.lastInsertRowid);

      insertFts.run(id, conteudoParaFts(r.conteudo), r.municipio);

      for (const cnpj of extractCnpjs(r.conteudo)) {
        insertCnpj.run(id, cnpj);
      }
    }
  });

  // batchInsert nao serve aqui (precisamos do lastInsertRowid + tabelas filhas),
  // entao agrupamos manualmente em lotes dentro de transacoes.
  const batch = 500;

  for (let i = 0; i < registros.length; i += batch) {
    tx(registros.slice(i, i + batch));
  }

  return registros.length;
}

export { batchInsert };
