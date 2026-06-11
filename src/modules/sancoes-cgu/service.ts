/**
 * Funcoes de busca sobre o indice de sancoes.
 *
 * Todas recebem um Database (bun:sqlite) e sao puras quanto a rede/disco;
 * o caller (tools/build) abre o banco. Os testes passam Database(':memory:').
 */
import type { Database } from "bun:sqlite";
import { Result } from "better-result";
import { onlyDigits } from "../../core/normalize";
import { sancoesCguErrors } from "./errors";
import type { DatasetKey } from "./catalog";

export type SancaoResultado = {
  lista: DatasetKey;
  codigo: string | null;
  tipoPessoa: string | null;
  documento: string | null;
  nome: string | null;
  razaoSocial: string | null;
  categoria: string | null;
  numeroProcesso: string | null;
  valorMulta: string | null;
  dataInicio: string | null;
  dataFinal: string | null;
  dataPublicacao: string | null;
  orgaoSancionador: string | null;
  ufOrgao: string | null;
  fundamentacao: string | null;
};

const SELECT_COLS = `
  lista, codigo, tipo_pessoa AS tipoPessoa, documento,
  nome, razao_social AS razaoSocial, categoria,
  numero_processo AS numeroProcesso, valor_multa AS valorMulta,
  data_inicio AS dataInicio, data_final AS dataFinal,
  data_publicacao AS dataPublicacao, orgao_sancionador AS orgaoSancionador,
  uf_orgao AS ufOrgao, fundamentacao
`;

/** Listas que indicam inidoneidade/impedimento de pessoa juridica. */
const LISTAS_IMPEDITIVAS: DatasetKey[] = ["ceis", "cnep", "cepim"];

export type VerificarSancoesResultado = {
  documento: string;
  docNormalizado: string;
  tipoDocumento: "cpf" | "cnpj" | "desconhecido";
  sancionado: boolean;
  /** true se aparece em CEIS, CNEP ou CEPIM (inidonea/impedida). */
  inidoneoOuImpedido: boolean;
  total: number;
  porLista: Record<string, number>;
  sancoes: SancaoResultado[];
};

/**
 * Cruza um CNPJ (14) ou CPF (11) contra TODAS as listas de uma vez.
 * Casa por busca exata no documento normalizado (so digitos). Como o CEAF
 * mascara o CPF, registros do CEAF so aparecem aqui quando o documento
 * informado nao tem mascara correspondente — por isso a busca por nome existe.
 */
export function verificarSancoes(
  db: Database,
  documentoInput: string
): VerificarSancoesResultado {
  const docNormalizado = onlyDigits(documentoInput);
  const tipoDocumento =
    docNormalizado.length === 14
      ? "cnpj"
      : docNormalizado.length === 11
        ? "cpf"
        : "desconhecido";

  const rows = db
    .query(`SELECT ${SELECT_COLS} FROM sancao WHERE doc_normalizado = ? ORDER BY lista, data_inicio DESC`)
    .all(docNormalizado) as SancaoResultado[];

  const porLista: Record<string, number> = {};

  for (const row of rows) {
    porLista[row.lista] = (porLista[row.lista] ?? 0) + 1;
  }

  const inidoneoOuImpedido = rows.some((row) =>
    LISTAS_IMPEDITIVAS.includes(row.lista)
  );

  return {
    documento: documentoInput,
    docNormalizado,
    tipoDocumento,
    sancionado: rows.length > 0,
    inidoneoOuImpedido,
    total: rows.length,
    porLista,
    sancoes: rows,
  };
}

export type BuscarPorNomeResultado = {
  termo: string;
  total: number;
  sancoes: SancaoResultado[];
};

/**
 * Busca sancionados por nome / razao social usando FTS5 (com fallback LIKE).
 * O termo e normalizado (sem acento) para casar com a coluna busca_texto.
 */
export function buscarSancionadoPorNome(
  db: Database,
  termoInput: string,
  limite = 50
): BuscarPorNomeResultado {
  const termo = normalizeTermo(termoInput);
  const limit = clampLimite(limite);

  let rows: SancaoResultado[] = [];

  const ftsQuery = toFtsQuery(termo);

  if (ftsQuery) {
    // MATCH com sintaxe invalida lanca; tratamos como "sem resultado FTS" e
    // caimos no fallback LIKE abaixo.
    const fts = consultarFts(db, ftsQuery, limit);

    rows = Result.isOk(fts) ? fts.value : [];
  }

  // Fallback LIKE quando o FTS nao retornou nada (ex.: termo muito curto).
  if (rows.length === 0) {
    rows = db
      .query(
        `SELECT ${SELECT_COLS} FROM sancao WHERE busca_texto LIKE ? LIMIT ?`
      )
      .all(`%${termo}%`, limit) as SancaoResultado[];
  }

  return { termo: termoInput, total: rows.length, sancoes: rows };
}

export type VigentesNaDataResultado = {
  data: string;
  total: number;
  sancoes: SancaoResultado[];
};

/**
 * Lista sancoes vigentes numa data (YYYY-MM-DD): data_inicio <= data e
 * (data_final >= data OU data_final nula = sem termino). Considera apenas
 * registros com data_inicio (CEIS/CNEP/Acordos); CEAF/CEPIM ficam de fora
 * por nao terem intervalo de vigencia. Filtro opcional por lista.
 */
export function sancoesVigentesNaData(
  db: Database,
  data: string,
  opts?: { lista?: DatasetKey; limite?: number }
): VigentesNaDataResultado {
  const iso = data.trim();
  const limit = clampLimite(opts?.limite ?? 200);
  const listaFilter = opts?.lista ? " AND lista = ?" : "";

  const sql = `
    SELECT ${SELECT_COLS}
    FROM sancao
    WHERE data_inicio IS NOT NULL
      AND data_inicio <= ?
      AND (data_final IS NULL OR data_final >= ?)
      ${listaFilter}
    ORDER BY data_inicio DESC
    LIMIT ?
  `;

  const params: unknown[] = opts?.lista
    ? [iso, iso, opts.lista, limit]
    : [iso, iso, limit];

  const rows = db.query(sql).all(...(params as never[])) as SancaoResultado[];

  return { data: iso, total: rows.length, sancoes: rows };
}

/** Consulta o FTS5; erra (sintaxe MATCH invalida) sem propagar excecao. */
function consultarFts(db: Database, ftsQuery: string, limit: number) {
  return Result.try({
    try: () =>
      db
        .query(
          `SELECT ${SELECT_COLS}
           FROM sancao_fts
           JOIN sancao ON sancao.id = sancao_fts.rowid
           WHERE sancao_fts MATCH ?
           LIMIT ?`
        )
        .all(ftsQuery, limit) as SancaoResultado[],
    catch: (cause) =>
      sancoesCguErrors.PARSE({
        dataset: "sancao_fts",
        internal: { cause: String(cause) },
      }),
  });
}

function normalizeTermo(termo: string): string {
  return termo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte o termo em query FTS5 segura (cada palavra como prefixo). */
function toFtsQuery(termo: string): string {
  const tokens = termo
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return "";

  return tokens.map((t) => `"${t}"*`).join(" ");
}

function clampLimite(limite: number): number {
  if (!Number.isFinite(limite) || limite <= 0) return 50;

  return Math.min(Math.floor(limite), 500);
}
