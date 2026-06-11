import type { Database } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import dayjs from "dayjs";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { dominioPath } from "../../core/dataDir";
import { normalize } from "../../core/normalize";
import { batchInsert, dbExists, openDb } from "../../core/store/sqlite-store";
import type { Norma } from "./catalog";
import { legislacaoErrors as erros } from "./errors";
import { legislacaoIndexAdapter } from "./indexer";

const DOMINIO = "legislacao";
const DB_FILE = "legislacao.db";

export type StoreError = EvlogError;

/** Documento bruto produzido pelo indexer (uma norma + seus paragrafos). */
export type DocumentoIndexado = {
  norma: Norma;
  paragrafos: string[];
};

// ---- Schemas validados (as saidas do store passam por .parse) ----

export const statusLegislacaoSchema = z
  .object({
    caminho: z.string(),
    existe: z.boolean(),
    indexando: z.boolean(),
    erro: z.string().nullable(),
    atualizadoEm: z.string().nullable(),
    normasIndexadas: z.array(z.string()),
  })
  .strict();
export type StatusLegislacao = z.infer<typeof statusLegislacaoSchema>;

export const recriarResultadoSchema = z
  .object({
    caminho: z.string(),
    atualizadoEm: z.string(),
    normasIndexadas: z.array(z.string()),
  })
  .strict();
export type RecriarResultado = z.infer<typeof recriarResultadoSchema>;

type RuntimeState = { indexando: boolean; erro: string | null };
const runtimeState: RuntimeState = { indexando: false, erro: null };

export function getIndexPath(): string {
  return dominioPath(DOMINIO, DB_FILE);
}

export function indiceExiste(): boolean {
  return dbExists(DOMINIO, DB_FILE);
}

/**
 * Abre o banco do dominio (handle rw reusavel do singleton). Cria o arquivo se
 * necessario — usado tanto pela escrita (gravar/seed de testes) quanto pelas
 * leituras de status, que rodam apos o guard indiceExiste().
 */
export function abrirLeitura(): Database {
  return openDb(DOMINIO, DB_FILE);
}

const INSERT_NORMA =
  "INSERT OR REPLACE INTO norma (id, titulo, url, apelidos, temas, total_paragrafos) VALUES (?, ?, ?, ?, ?, ?)";
const INSERT_PARAGRAFO =
  "INSERT INTO paragrafo (norma_id, idx, texto, texto_norm) VALUES (?, ?, ?, ?)";

/** Cria (idempotente) tabelas, indice secundario, FTS5 e meta. */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS norma (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      url TEXT NOT NULL,
      apelidos TEXT NOT NULL DEFAULT '[]',
      temas TEXT NOT NULL DEFAULT '[]',
      total_paragrafos INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS paragrafo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      norma_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      texto TEXT NOT NULL,
      texto_norm TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_paragrafo_norma ON paragrafo (norma_id, idx);

    CREATE VIRTUAL TABLE IF NOT EXISTS paragrafo_fts USING fts5(
      texto_norm,
      content='paragrafo',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
  `);
}

/** Substitui todo o conteudo do indice numa unica passada (snapshot completo). */
export function gravarIndice(
  db: Database,
  documentos: DocumentoIndexado[],
  criadoEm: string,
): void {
  const limpar = db.transaction(() => {
    db.exec("DELETE FROM paragrafo;");
    db.exec("DELETE FROM norma;");
    db.exec("INSERT INTO paragrafo_fts(paragrafo_fts) VALUES('delete-all');");
  });
  limpar();

  batchInsert(db, INSERT_NORMA, documentos, (doc) => [
    doc.norma.id,
    doc.norma.titulo,
    doc.norma.url,
    JSON.stringify(doc.norma.apelidos),
    JSON.stringify(doc.norma.temas),
    doc.paragrafos.length,
  ]);

  const paragrafos = documentos.flatMap((doc) =>
    doc.paragrafos.map((texto, idx) => ({
      norma_id: doc.norma.id,
      idx,
      texto,
    })),
  );

  batchInsert(db, INSERT_PARAGRAFO, paragrafos, (row) => [
    row.norma_id,
    row.idx,
    row.texto,
    normalize(row.texto),
  ]);

  db.exec("INSERT INTO paragrafo_fts(paragrafo_fts) VALUES('rebuild');");
  db.query(
    "INSERT OR REPLACE INTO meta (chave, valor) VALUES ('criadoEm', ?)",
  ).run(criadoEm);
}

function lerMeta(db: Database, chave: string): string | null {
  const row = db.query("SELECT valor FROM meta WHERE chave = ?").get(chave) as {
    valor: string;
  } | null;

  return row?.valor ?? null;
}

function lerNormasIndexadas(db: Database): string[] {
  const rows = db.query("SELECT id FROM norma ORDER BY id").all() as {
    id: string;
  }[];

  return rows.map((row) => row.id);
}

export async function statusIndiceLocal(): Promise<
  ResultType<StatusLegislacao, StoreError>
> {
  if (!indiceExiste()) {
    return Result.ok(
      statusLegislacaoSchema.parse({
        caminho: getIndexPath(),
        existe: false,
        indexando: runtimeState.indexando,
        erro: runtimeState.erro,
        atualizadoEm: null,
        normasIndexadas: [],
      }),
    );
  }

  return Result.try({
    try: () => {
      const db = abrirLeitura();

      return statusLegislacaoSchema.parse({
        caminho: getIndexPath(),
        existe: true,
        indexando: runtimeState.indexando,
        erro: runtimeState.erro,
        atualizadoEm: lerMeta(db, "criadoEm"),
        normasIndexadas: lerNormasIndexadas(db),
      });
    },
    catch: (cause): EvlogError =>
      erros.LEITURA({
        internal: { path: getIndexPath(), cause: String(cause) },
      }),
  });
}

export async function recriarIndiceLocal(): Promise<
  ResultType<RecriarResultado, StoreError>
> {
  runtimeState.indexando = true;
  runtimeState.erro = null;

  const resultado = await Result.gen(async function* () {
    const documentos = yield* Result.await(
      legislacaoIndexAdapter.buildDocumentos(),
    );
    const criadoEm = dayjs().toISOString();

    yield* gravar(documentos, criadoEm);

    return Result.ok(
      recriarResultadoSchema.parse({
        caminho: getIndexPath(),
        atualizadoEm: criadoEm,
        normasIndexadas: documentos.map((doc) => doc.norma.id),
      }),
    );
  });

  runtimeState.indexando = false;
  runtimeState.erro = Result.isError(resultado)
    ? resultado.error.message
    : null;

  return resultado;
}

function gravar(
  documentos: DocumentoIndexado[],
  criadoEm: string,
): ResultType<true, EvlogError> {
  return Result.try({
    try: () => {
      const db = openDb(DOMINIO, DB_FILE);

      createSchema(db);
      gravarIndice(db, documentos, criadoEm);

      return true as const;
    },
    catch: (cause): EvlogError =>
      erros.ESCRITA({
        internal: { path: getIndexPath(), cause: String(cause) },
      }),
  });
}
