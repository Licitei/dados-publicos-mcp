/**
 * Esquema SQLite das sancoes da CGU + funcoes de escrita.
 *
 * Tudo recebe um Database (bun:sqlite), de modo que o build() usa o banco em
 * disco (openDb) e os testes usam Database(':memory:') sem rede nem arquivos.
 *
 * Modelagem:
 * - sancao: uma linha por registro de qualquer lista (CEIS/CNEP/CEAF/CEPIM/
 *   Acordos). doc_normalizado e indice secundario NAO-unico (mesmo CNPJ aparece
 *   em varias linhas). PK tecnica = rowid.
 * - efeito_acordo: efeitos 1:N por id_acordo (FK logica para sancao.codigo
 *   quando lista="acordos-leniencia").
 * - sancao_fts: FTS5 sobre nome/razao social para busca textual.
 * - meta: chave/valor para atualizado_em e contagens.
 *
 * Snapshot diario completo => recriar = DROP + CREATE + INSERT em transacao.
 */
import type { Database } from "bun:sqlite";
import { batchInsert, countRows } from "../../core/store/sqlite-store";
import type { EfeitoRow, SancaoRow } from "./parse";

const SANCAO_COLUMNS = [
  "lista",
  "codigo",
  "tipo_pessoa",
  "documento",
  "doc_normalizado",
  "nome",
  "razao_social",
  "categoria",
  "numero_processo",
  "valor_multa",
  "data_inicio",
  "data_final",
  "data_publicacao",
  "orgao_sancionador",
  "uf_orgao",
  "fundamentacao",
  "busca_texto",
] as const;

const INSERT_SANCAO = `INSERT INTO sancao (${SANCAO_COLUMNS.join(", ")}) VALUES (${SANCAO_COLUMNS.map(() => "?").join(", ")})`;

const INSERT_EFEITO =
  "INSERT INTO efeito_acordo (id_acordo, doc_normalizado, efeito, complemento) VALUES (?, ?, ?, ?)";

/** Cria (idempotente) as tabelas, indices secundarios e o indice FTS5. */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sancao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lista TEXT NOT NULL,
      codigo TEXT,
      tipo_pessoa TEXT,
      documento TEXT,
      doc_normalizado TEXT NOT NULL DEFAULT '',
      nome TEXT,
      razao_social TEXT,
      categoria TEXT,
      numero_processo TEXT,
      valor_multa TEXT,
      data_inicio TEXT,
      data_final TEXT,
      data_publicacao TEXT,
      orgao_sancionador TEXT,
      uf_orgao TEXT,
      fundamentacao TEXT,
      busca_texto TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sancao_doc ON sancao (doc_normalizado);
    CREATE INDEX IF NOT EXISTS idx_sancao_lista ON sancao (lista);
    CREATE INDEX IF NOT EXISTS idx_sancao_data_inicio ON sancao (data_inicio);
    CREATE INDEX IF NOT EXISTS idx_sancao_data_final ON sancao (data_final);
    CREATE INDEX IF NOT EXISTS idx_sancao_codigo ON sancao (codigo);

    CREATE TABLE IF NOT EXISTS efeito_acordo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_acordo TEXT NOT NULL,
      doc_normalizado TEXT NOT NULL DEFAULT '',
      efeito TEXT,
      complemento TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_efeito_acordo ON efeito_acordo (id_acordo);

    CREATE VIRTUAL TABLE IF NOT EXISTS sancao_fts USING fts5 (
      busca_texto,
      content='sancao',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS meta (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

/** Apaga todos os dados (snapshot diario completo recria do zero). */
export function truncateAll(db: Database): void {
  db.exec(`
    DELETE FROM sancao_fts;
    DELETE FROM sancao;
    DELETE FROM efeito_acordo;
  `);
}

/** Insere linhas de sancao e mantem o FTS5 sincronizado. */
export function insertSancoes(db: Database, rows: SancaoRow[]): void {
  batchInsert(db, INSERT_SANCAO, rows, (row) => [
    row.lista,
    row.codigo,
    row.tipoPessoa,
    row.documento,
    row.docNormalizado,
    row.nome,
    row.razaoSocial,
    row.categoria,
    row.numeroProcesso,
    row.valorMulta,
    row.dataInicio,
    row.dataFinal,
    row.dataPublicacao,
    row.orgaoSancionador,
    row.ufOrgao,
    row.fundamentacao,
    row.buscaTexto,
  ]);
}

/** Insere efeitos de acordos de leniencia. */
export function insertEfeitos(db: Database, rows: EfeitoRow[]): void {
  batchInsert(db, INSERT_EFEITO, rows, (row) => [
    row.idAcordo,
    row.docNormalizado,
    row.efeito,
    row.complemento,
  ]);
}

/** Reconstroi o indice FTS5 a partir do conteudo atual de sancao. */
export function rebuildFts(db: Database): void {
  db.exec("INSERT INTO sancao_fts(sancao_fts) VALUES ('rebuild');");
}

/** Grava um valor em meta. */
export function setMeta(db: Database, chave: string, valor: string): void {
  db.query(
    "INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(chave, valor);
}

/** Le um valor de meta (ou null). */
export function getMeta(db: Database, chave: string): string | null {
  const row = db.query("SELECT valor FROM meta WHERE chave = ?").get(chave) as {
    valor: string;
  } | null;

  return row?.valor ?? null;
}

/** Total de linhas de sancao. */
export function totalSancoes(db: Database): number {
  return countRows(db, "sancao");
}
