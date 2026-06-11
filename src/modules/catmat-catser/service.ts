/**
 * Funcoes de busca e lookup sobre o indice SQLite CATMAT/CATSER.
 *
 * Todas as funcoes recebem o Database explicitamente para permitir testes com
 * Database(':memory:') e sem rede. As wrappers que abrem o banco em disco
 * vivem em indexer.ts/tools.ts.
 */

import type { Database } from "bun:sqlite";

export type CatmatMatch = {
  tipo: "material";
  codigoItem: number;
  descricaoItem: string | null;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoPdm: number | null;
  nomePdm: string | null;
  statusItem: boolean;
  score: number;
};

export type CatserMatch = {
  tipo: "servico";
  codigoServico: number;
  nomeServico: string | null;
  codigoSecao: number | null;
  nomeSecao: string | null;
  codigoDivisao: number | null;
  nomeDivisao: string | null;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoSubclasse: number | null;
  nomeSubclasse: string | null;
  codigoCpc: number | null;
  statusServico: boolean;
  score: number;
};

/** Extrai tokens normalizados (sem acento, minusculos, >=2 caracteres). */
export function ftsTokens(termo: string): string[] {
  return termo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((t) => t.length >= 2);
}

/**
 * Converte texto livre em uma consulta FTS5 segura.
 *
 * Quebra em tokens (apenas letras/numeros), descarta tokens com menos de 2
 * caracteres e adiciona prefixo "*" a cada token para casamento por prefixo.
 * Cada token e citado entre aspas para evitar interpretacao de sintaxe FTS
 * (operadores, dois-pontos, etc.).
 *
 * combine='and' (default): todos os tokens precisam casar (busca precisa).
 * combine='or': qualquer token casa (normalizacao de descricao livre).
 * Retorna "" quando nao ha token util.
 */
export function buildFtsQuery(
  termo: string,
  combine: "and" | "or" = "and"
): string {
  const tokens = ftsTokens(termo);

  if (tokens.length === 0) return "";

  const quoted = tokens.map((t) => `"${t}"*`);

  return combine === "or" ? quoted.join(" OR ") : quoted.join(" ");
}

function clampLimit(limite: number | undefined): number {
  if (!limite || limite < 1) return 20;

  return Math.min(limite, 100);
}

function asBool(value: unknown): boolean {
  return value === 1 || value === true;
}

/** Busca materiais por nome/descricao via FTS5 (ordenado por relevancia bm25). */
export function buscarMaterial(
  db: Database,
  termo: string,
  limite?: number,
  combine: "and" | "or" = "and"
): CatmatMatch[] {
  const query = buildFtsQuery(termo, combine);

  if (!query) return [];

  const rows = db
    .query(
      `
      SELECT i.codigoItem, i.descricaoItem, i.codigoGrupo, i.nomeGrupo,
             i.codigoClasse, i.nomeClasse, i.codigoPdm, i.nomePdm, i.statusItem,
             bm25(catmat_item_fts) AS rank
      FROM catmat_item_fts
      JOIN catmat_item i ON i.codigoItem = catmat_item_fts.rowid
      WHERE catmat_item_fts MATCH ?
      ORDER BY rank
      LIMIT ?
      `
    )
    .all(query, clampLimit(limite)) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    tipo: "material" as const,
    codigoItem: Number(r.codigoItem),
    descricaoItem: (r.descricaoItem as string | null) ?? null,
    codigoGrupo: r.codigoGrupo as number | null,
    nomeGrupo: (r.nomeGrupo as string | null) ?? null,
    codigoClasse: r.codigoClasse as number | null,
    nomeClasse: (r.nomeClasse as string | null) ?? null,
    codigoPdm: r.codigoPdm as number | null,
    nomePdm: (r.nomePdm as string | null) ?? null,
    statusItem: asBool(r.statusItem),
    score: Number(r.rank),
  }));
}

/** Busca servicos por nome via FTS5 (ordenado por relevancia bm25). */
export function buscarServico(
  db: Database,
  termo: string,
  limite?: number,
  combine: "and" | "or" = "and"
): CatserMatch[] {
  const query = buildFtsQuery(termo, combine);

  if (!query) return [];

  const rows = db
    .query(
      `
      SELECT s.codigoServico, s.nomeServico, s.codigoSecao, s.nomeSecao,
             s.codigoDivisao, s.nomeDivisao, s.codigoGrupo, s.nomeGrupo,
             s.codigoClasse, s.nomeClasse, s.codigoSubclasse, s.nomeSubclasse,
             s.codigoCpc, s.statusServico,
             bm25(catser_item_fts) AS rank
      FROM catser_item_fts
      JOIN catser_item s ON s.codigoServico = catser_item_fts.rowid
      WHERE catser_item_fts MATCH ?
      ORDER BY rank
      LIMIT ?
      `
    )
    .all(query, clampLimit(limite)) as Array<Record<string, unknown>>;

  return rows.map(mapCatserRow);
}

function mapCatserRow(r: Record<string, unknown>): CatserMatch {
  return {
    tipo: "servico" as const,
    codigoServico: Number(r.codigoServico),
    nomeServico: (r.nomeServico as string | null) ?? null,
    codigoSecao: r.codigoSecao as number | null,
    nomeSecao: (r.nomeSecao as string | null) ?? null,
    codigoDivisao: r.codigoDivisao as number | null,
    nomeDivisao: (r.nomeDivisao as string | null) ?? null,
    codigoGrupo: r.codigoGrupo as number | null,
    nomeGrupo: (r.nomeGrupo as string | null) ?? null,
    codigoClasse: r.codigoClasse as number | null,
    nomeClasse: (r.nomeClasse as string | null) ?? null,
    codigoSubclasse: r.codigoSubclasse as number | null,
    nomeSubclasse: (r.nomeSubclasse as string | null) ?? null,
    codigoCpc: r.codigoCpc as number | null,
    statusServico: asBool(r.statusServico),
    score: Number(r.rank ?? 0),
  };
}

/**
 * Resolve um codigo CATMAT (material) para descricao + hierarquia.
 * Hierarquia material: Grupo > Classe > PDM > Item.
 */
export function resolverMaterial(
  db: Database,
  codigoItem: number
): CatmatMatch | null {
  const r = db
    .query(
      `
      SELECT codigoItem, descricaoItem, codigoGrupo, nomeGrupo, codigoClasse,
             nomeClasse, codigoPdm, nomePdm, statusItem
      FROM catmat_item WHERE codigoItem = ?
      `
    )
    .get(codigoItem) as Record<string, unknown> | null;

  if (!r) return null;

  return {
    tipo: "material",
    codigoItem: Number(r.codigoItem),
    descricaoItem: (r.descricaoItem as string | null) ?? null,
    codigoGrupo: r.codigoGrupo as number | null,
    nomeGrupo: (r.nomeGrupo as string | null) ?? null,
    codigoClasse: r.codigoClasse as number | null,
    nomeClasse: (r.nomeClasse as string | null) ?? null,
    codigoPdm: r.codigoPdm as number | null,
    nomePdm: (r.nomePdm as string | null) ?? null,
    statusItem: asBool(r.statusItem),
    score: 0,
  };
}

/**
 * Resolve um codigo CATSER (servico) para nome + hierarquia.
 * Hierarquia servico: Secao > Divisao > Grupo > Classe > Subclasse > Servico.
 */
export function resolverServico(
  db: Database,
  codigoServico: number
): CatserMatch | null {
  const r = db
    .query(
      `
      SELECT codigoServico, nomeServico, codigoSecao, nomeSecao, codigoDivisao,
             nomeDivisao, codigoGrupo, nomeGrupo, codigoClasse, nomeClasse,
             codigoSubclasse, nomeSubclasse, codigoCpc, statusServico
      FROM catser_item WHERE codigoServico = ?
      `
    )
    .get(codigoServico) as Record<string, unknown> | null;

  if (!r) return null;

  return mapCatserRow(r);
}

/**
 * Resolve por codigo tentando material e servico (a chave nao indica o tipo).
 * Quando `tipo` e fornecido, consulta apenas a tabela correspondente.
 */
export function resolverCatmatCatser(
  db: Database,
  codigo: number,
  tipo?: "material" | "servico"
): { material: CatmatMatch | null; servico: CatserMatch | null } {
  return {
    material:
      tipo === "servico" ? null : resolverMaterial(db, codigo),
    servico:
      tipo === "material" ? null : resolverServico(db, codigo),
  };
}

/**
 * Normaliza uma descricao livre de edital para os CATMAT/CATSER mais provaveis.
 * Combina FTS de material e servico e devolve as melhores correspondencias de
 * cada lado ordenadas por relevancia. Usado para deduplicar/casar com PNCP.
 */
export function normalizarItemEdital(
  db: Database,
  descricao: string,
  limite?: number
): {
  termo: string;
  materiais: CatmatMatch[];
  servicos: CatserMatch[];
} {
  const n = clampLimit(limite);

  // OR: descricao de edital usa termos livres; casar qualquer token e melhor
  // para recuperar candidatos (ordenados por bm25, os mais relevantes vem antes).
  return {
    termo: descricao,
    materiais: buscarMaterial(db, descricao, n, "or"),
    servicos: buscarServico(db, descricao, n, "or"),
  };
}
