/**
 * Esquema SQLite do catalogo CATMAT/CATSER e helpers de carga em lote.
 *
 * Tabelas:
 *   catmat_item   - itens de material (hierarquia material: Grupo>Classe>PDM>Item)
 *   catser_item   - itens de servico (hierarquia: Secao>Divisao>Grupo>Classe>Subclasse>Servico)
 *   catmat_grupo  - nivel 1 da hierarquia de material
 *   catmat_classe - nivel 2
 *   catmat_pdm    - nivel 3
 *
 * FTS5:
 *   catmat_item_fts (descricaoItem) -> rowid = codigoItem
 *   catser_item_fts (nomeServico)   -> rowid = codigoServico
 *
 * O DDL e exportado para que o teste possa criar um banco :memory: identico.
 */

import type { Database } from "bun:sqlite";
import { batchInsert } from "../../core/store/sqlite-store";
import type {
  CatmatItemRow,
  CatserItemRow,
  RawCatmatClasse,
  RawCatmatGrupo,
  RawCatmatPdm,
} from "./schema";

/** Cria todas as tabelas, indices secundarios e tabelas FTS5 (idempotente). */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catmat_item (
      codigoItem INTEGER PRIMARY KEY,
      codigoGrupo INTEGER,
      nomeGrupo TEXT,
      codigoClasse INTEGER,
      nomeClasse TEXT,
      codigoPdm INTEGER,
      nomePdm TEXT,
      descricaoItem TEXT,
      statusItem INTEGER NOT NULL DEFAULT 0,
      itemSustentavel INTEGER NOT NULL DEFAULT 0,
      codigoNcm TEXT,
      descricaoNcm TEXT,
      aplicaMargemPreferencia INTEGER NOT NULL DEFAULT 0,
      dataHoraAtualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_catmat_item_grupo ON catmat_item(codigoGrupo);
    CREATE INDEX IF NOT EXISTS idx_catmat_item_classe ON catmat_item(codigoClasse);
    CREATE INDEX IF NOT EXISTS idx_catmat_item_pdm ON catmat_item(codigoPdm);
    CREATE INDEX IF NOT EXISTS idx_catmat_item_ncm ON catmat_item(codigoNcm);

    CREATE TABLE IF NOT EXISTS catser_item (
      codigoServico INTEGER PRIMARY KEY,
      nomeServico TEXT,
      codigoSecao INTEGER,
      nomeSecao TEXT,
      codigoDivisao INTEGER,
      nomeDivisao TEXT,
      codigoGrupo INTEGER,
      nomeGrupo TEXT,
      codigoClasse INTEGER,
      nomeClasse TEXT,
      codigoSubclasse INTEGER,
      nomeSubclasse TEXT,
      codigoCpc INTEGER,
      exclusivoCentralCompras INTEGER NOT NULL DEFAULT 0,
      statusServico INTEGER NOT NULL DEFAULT 0,
      dataHoraAtualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_catser_item_secao ON catser_item(codigoSecao);
    CREATE INDEX IF NOT EXISTS idx_catser_item_grupo ON catser_item(codigoGrupo);
    CREATE INDEX IF NOT EXISTS idx_catser_item_classe ON catser_item(codigoClasse);
    CREATE INDEX IF NOT EXISTS idx_catser_item_cpc ON catser_item(codigoCpc);

    CREATE TABLE IF NOT EXISTS catmat_grupo (
      codigoGrupo INTEGER PRIMARY KEY,
      nomeGrupo TEXT,
      statusGrupo INTEGER NOT NULL DEFAULT 0,
      dataHoraAtualizacao TEXT
    );

    CREATE TABLE IF NOT EXISTS catmat_classe (
      codigoClasse INTEGER PRIMARY KEY,
      codigoGrupo INTEGER,
      nomeGrupo TEXT,
      nomeClasse TEXT,
      statusClasse INTEGER NOT NULL DEFAULT 0,
      dataHoraAtualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_catmat_classe_grupo ON catmat_classe(codigoGrupo);

    CREATE TABLE IF NOT EXISTS catmat_pdm (
      codigoPdm INTEGER PRIMARY KEY,
      codigoGrupo INTEGER,
      codigoClasse INTEGER,
      nomeGrupo TEXT,
      nomeClasse TEXT,
      nomePdm TEXT,
      statusPdm INTEGER NOT NULL DEFAULT 0,
      dataHoraAtualizacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_catmat_pdm_grupo ON catmat_pdm(codigoGrupo);
    CREATE INDEX IF NOT EXISTS idx_catmat_pdm_classe ON catmat_pdm(codigoClasse);

    CREATE VIRTUAL TABLE IF NOT EXISTS catmat_item_fts USING fts5(
      descricaoItem,
      content='catmat_item',
      content_rowid='codigoItem',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS catser_item_fts USING fts5(
      nomeServico,
      content='catser_item',
      content_rowid='codigoServico',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TABLE IF NOT EXISTS metadata (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

/** Limpa todas as tabelas para uma reindexacao completa. */
export function resetTables(db: Database): void {
  db.exec(`
    DELETE FROM catmat_item_fts;
    DELETE FROM catser_item_fts;
    DELETE FROM catmat_item;
    DELETE FROM catser_item;
    DELETE FROM catmat_grupo;
    DELETE FROM catmat_classe;
    DELETE FROM catmat_pdm;
  `);
}

const INSERT_CATMAT_ITEM = `
  INSERT OR REPLACE INTO catmat_item (
    codigoItem, codigoGrupo, nomeGrupo, codigoClasse, nomeClasse,
    codigoPdm, nomePdm, descricaoItem, statusItem, itemSustentavel,
    codigoNcm, descricaoNcm, aplicaMargemPreferencia, dataHoraAtualizacao
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_CATSER_ITEM = `
  INSERT OR REPLACE INTO catser_item (
    codigoServico, nomeServico, codigoSecao, nomeSecao, codigoDivisao,
    nomeDivisao, codigoGrupo, nomeGrupo, codigoClasse, nomeClasse,
    codigoSubclasse, nomeSubclasse, codigoCpc, exclusivoCentralCompras,
    statusServico, dataHoraAtualizacao
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_CATMAT_GRUPO = `
  INSERT OR REPLACE INTO catmat_grupo (codigoGrupo, nomeGrupo, statusGrupo, dataHoraAtualizacao)
  VALUES (?, ?, ?, ?)
`;

const INSERT_CATMAT_CLASSE = `
  INSERT OR REPLACE INTO catmat_classe (codigoClasse, codigoGrupo, nomeGrupo, nomeClasse, statusClasse, dataHoraAtualizacao)
  VALUES (?, ?, ?, ?, ?, ?)
`;

const INSERT_CATMAT_PDM = `
  INSERT OR REPLACE INTO catmat_pdm (codigoPdm, codigoGrupo, codigoClasse, nomeGrupo, nomeClasse, nomePdm, statusPdm, dataHoraAtualizacao)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export function insertCatmatItens(db: Database, rows: CatmatItemRow[]): void {
  batchInsert(db, INSERT_CATMAT_ITEM, rows, (r) => [
    r.codigoItem,
    r.codigoGrupo,
    r.nomeGrupo,
    r.codigoClasse,
    r.nomeClasse,
    r.codigoPdm,
    r.nomePdm,
    r.descricaoItem,
    r.statusItem,
    r.itemSustentavel,
    r.codigoNcm,
    r.descricaoNcm,
    r.aplicaMargemPreferencia,
    r.dataHoraAtualizacao,
  ]);
}

export function insertCatserItens(db: Database, rows: CatserItemRow[]): void {
  batchInsert(db, INSERT_CATSER_ITEM, rows, (r) => [
    r.codigoServico,
    r.nomeServico,
    r.codigoSecao,
    r.nomeSecao,
    r.codigoDivisao,
    r.nomeDivisao,
    r.codigoGrupo,
    r.nomeGrupo,
    r.codigoClasse,
    r.nomeClasse,
    r.codigoSubclasse,
    r.nomeSubclasse,
    r.codigoCpc,
    r.exclusivoCentralCompras,
    r.statusServico,
    r.dataHoraAtualizacao,
  ]);
}

export function insertCatmatGrupos(db: Database, rows: RawCatmatGrupo[]): void {
  batchInsert(db, INSERT_CATMAT_GRUPO, rows, (r) => [
    Number(r.codigoGrupo),
    r.nomeGrupo ?? null,
    r.statusGrupo ? 1 : 0,
    r.dataHoraAtualizacao ?? null,
  ]);
}

export function insertCatmatClasses(
  db: Database,
  rows: RawCatmatClasse[],
): void {
  batchInsert(db, INSERT_CATMAT_CLASSE, rows, (r) => [
    Number(r.codigoClasse),
    r.codigoGrupo ?? null,
    r.nomeGrupo ?? null,
    r.nomeClasse ?? null,
    r.statusClasse ? 1 : 0,
    r.dataHoraAtualizacao ?? null,
  ]);
}

export function insertCatmatPdms(db: Database, rows: RawCatmatPdm[]): void {
  batchInsert(db, INSERT_CATMAT_PDM, rows, (r) => [
    Number(r.codigoPdm),
    r.codigoGrupo ?? null,
    r.codigoClasse ?? null,
    r.nomeGrupo ?? null,
    r.nomeClasse ?? null,
    r.nomePdm ?? null,
    r.statusPdm ? 1 : 0,
    r.dataHoraAtualizacao ?? null,
  ]);
}

/**
 * Reconstroi os indices FTS5 a partir das tabelas de conteudo.
 * Use uma vez ao final da carga (mais barato que manter triggers).
 */
export function rebuildFts(db: Database): void {
  db.exec(`INSERT INTO catmat_item_fts(catmat_item_fts) VALUES('rebuild');`);
  db.exec(`INSERT INTO catser_item_fts(catser_item_fts) VALUES('rebuild');`);
}

/** Grava um par chave/valor na tabela de metadados. */
export function setMetadata(db: Database, chave: string, valor: string): void {
  db.query(`INSERT OR REPLACE INTO metadata (chave, valor) VALUES (?, ?)`).run(
    chave,
    valor,
  );
}

/** Le um valor de metadados (ou null). */
export function getMetadata(db: Database, chave: string): string | null {
  const row = db
    .query(`SELECT valor FROM metadata WHERE chave = ?`)
    .get(chave) as { valor: string } | null;

  return row?.valor ?? null;
}
