import type { Database } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { dominioPath } from "../../core/dataDir";
import { onlyDigits } from "../../core/normalize";
import { openDb } from "../../core/store/sqlite-store";
import { KEY } from "./catalog";
import { tseEleitoralErrors } from "./errors";
import { DB_FILE } from "./store";

function dbPath(): string {
  return dominioPath(KEY, DB_FILE);
}

/**
 * Abre o banco do dominio para leitura. Falha (Result.err) quando o indice
 * ainda nao foi construido (build pesado nao rodou).
 */
export function abrirBanco(): ResultType<Database, EvlogError> {
  const caminho = dbPath();

  if (!(Bun.file(caminho).size > 0)) {
    return Result.err(tseEleitoralErrors.INDICE_AUSENTE({ caminho }));
  }

  return Result.ok(openDb(KEY, DB_FILE));
}

/** Detecta se o termo de busca e um documento (CPF/CNPJ) ou um nome. */
function ehDocumento(termo: string): boolean {
  const d = onlyDigits(termo);

  return d.length >= 11 && d.length === termo.replace(/[.\-/\s]/g, "").length;
}

/** Sanitiza um termo para uso como prefixo MATCH do FTS5. */
function ftsQuery(termo: string): string {
  const tokens = termo
    .replace(/["']/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `"${t}"*`);

  return tokens.join(" ");
}

const LIMITE_MAX = 200;

function clampLimite(limite: number | undefined, def = 50): number {
  if (limite === undefined) return def;

  return Math.max(1, Math.min(limite, LIMITE_MAX));
}

// ---------------------------------------------------------------------------
// Tool: buscar_doacoes
//   CPF/CNPJ ou nome do doador -> para quais candidatos doou e quanto.
// ---------------------------------------------------------------------------

export type BuscarDoacoesInput = {
  termo: string;
  ano?: number;
  limite?: number;
};

export function buscarDoacoes(
  db: Database,
  input: BuscarDoacoesInput
): unknown[] {
  const limite = clampLimite(input.limite);
  const anoFiltro = input.ano ? " AND r.ano_eleicao = ?" : "";
  const select = `
    SELECT r.cpf_cnpj_doador, r.nome_doador, r.nome_doador_rfb,
           r.cd_cnae_doador, r.ds_cnae_doador, r.ano_eleicao,
           r.sq_candidato, r.cpf_candidato, c.nome AS nome_candidato,
           c.ds_cargo, c.sg_uf AS uf_candidato, c.sg_partido,
           r.vr_receita, r.dt_receita, r.ds_natureza, r.nr_recibo
    FROM receitas r
    LEFT JOIN candidatos c ON c.sq_candidato = r.sq_candidato`;

  if (ehDocumento(input.termo)) {
    const doc = onlyDigits(input.termo);
    const sql = `${select} WHERE r.cpf_cnpj_doador = ?${anoFiltro}
                 ORDER BY r.vr_receita DESC LIMIT ?`;
    const params = anoFiltro ? [doc, input.ano, limite] : [doc, limite];

    return db.query(sql).all(...(params as never[]));
  }

  const match = ftsQuery(input.termo);
  const sql = `${select}
    JOIN receitas_fts f ON f.rowid = r.rowid
    WHERE receitas_fts MATCH ?${anoFiltro}
    ORDER BY r.vr_receita DESC LIMIT ?`;
  const params = anoFiltro ? [match, input.ano, limite] : [match, limite];

  return db.query(sql).all(...(params as never[]));
}

// ---------------------------------------------------------------------------
// Tool: buscar_fornecedor_campanha
//   CPF/CNPJ ou nome do fornecedor -> quais campanhas o contrataram.
// ---------------------------------------------------------------------------

export type BuscarFornecedorInput = {
  termo: string;
  ano?: number;
  limite?: number;
};

export function buscarFornecedorCampanha(
  db: Database,
  input: BuscarFornecedorInput
): unknown[] {
  const limite = clampLimite(input.limite);
  const anoFiltro = input.ano ? " AND d.ano_eleicao = ?" : "";
  const select = `
    SELECT d.cpf_cnpj_forn, d.nome_forn, d.nome_forn_rfb,
           d.cd_cnae_forn, d.ds_cnae_forn, d.ano_eleicao,
           d.sq_candidato, d.cpf_candidato, c.nome AS nome_candidato,
           c.ds_cargo, c.sg_uf AS uf_candidato, c.sg_partido,
           d.vr_despesa, d.dt_despesa, d.ds_despesa, d.nr_documento
    FROM despesas_contratadas d
    LEFT JOIN candidatos c ON c.sq_candidato = d.sq_candidato`;

  if (ehDocumento(input.termo)) {
    const doc = onlyDigits(input.termo);
    const sql = `${select} WHERE d.cpf_cnpj_forn = ?${anoFiltro}
                 ORDER BY d.vr_despesa DESC LIMIT ?`;
    const params = anoFiltro ? [doc, input.ano, limite] : [doc, limite];

    return db.query(sql).all(...(params as never[]));
  }

  const match = ftsQuery(input.termo);
  const sql = `${select}
    JOIN despesas_fts f ON f.rowid = d.rowid
    WHERE despesas_fts MATCH ?${anoFiltro}
    ORDER BY d.vr_despesa DESC LIMIT ?`;
  const params = anoFiltro ? [match, input.ano, limite] : [match, limite];

  return db.query(sql).all(...(params as never[]));
}

// ---------------------------------------------------------------------------
// Tool: rastrear_doador_originario
//   CPF/CNPJ do doador originario -> cadeia de dinheiro repassado por
//   partido/comite (join por SQ_RECEITA com receitas).
// ---------------------------------------------------------------------------

export type RastrearOriginarioInput = {
  cpfCnpj: string;
  ano?: number;
  limite?: number;
};

export function rastrearDoadorOriginario(
  db: Database,
  input: RastrearOriginarioInput
): unknown[] {
  const limite = clampLimite(input.limite);
  const doc = onlyDigits(input.cpfCnpj);
  const anoFiltro = input.ano ? " AND o.ano_eleicao = ?" : "";
  const sql = `
    SELECT o.cpf_cnpj_orig, o.nome_orig, o.nome_orig_rfb, o.tp_orig,
           o.cd_cnae_orig, o.ano_eleicao, o.sq_receita,
           o.vr_receita AS vr_originario, o.dt_receita,
           r.cpf_cnpj_doador AS repassador_cpf_cnpj,
           r.nome_doador AS repassador_nome,
           r.sq_candidato, r.cpf_candidato, c.nome AS nome_candidato,
           c.ds_cargo, c.sg_uf AS uf_candidato, c.sg_partido,
           r.vr_receita AS vr_recebido_candidato
    FROM receitas_doador_originario o
    LEFT JOIN receitas r ON r.sq_receita = o.sq_receita
    LEFT JOIN candidatos c ON c.sq_candidato = r.sq_candidato
    WHERE o.cpf_cnpj_orig = ?${anoFiltro}
    ORDER BY o.vr_receita DESC LIMIT ?`;
  const params = input.ano ? [doc, input.ano, limite] : [doc, limite];

  return db.query(sql).all(...(params as never[]));
}

// ---------------------------------------------------------------------------
// Tool: due_diligence_candidato
//   CPF ou SQ_CANDIDATO -> candidatura(s) + bens declarados (PEP / risco).
// ---------------------------------------------------------------------------

export type DueDiligenceInput = {
  cpf?: string;
  sqCandidato?: string;
  ano?: number;
};

export function dueDiligenceCandidato(
  db: Database,
  input: DueDiligenceInput
): {
  candidaturas: unknown[];
  bens: unknown[];
  totalBensDeclarado: number;
} {
  let candidaturas: unknown[] = [];
  const anoFiltro = input.ano ? " AND ano_eleicao = ?" : "";

  if (input.sqCandidato) {
    const sql = `SELECT * FROM candidatos WHERE sq_candidato = ?${anoFiltro}
                 ORDER BY ano_eleicao DESC`;
    const params = input.ano
      ? [input.sqCandidato, input.ano]
      : [input.sqCandidato];

    candidaturas = db.query(sql).all(...(params as never[]));
  } else if (input.cpf) {
    const cpf = onlyDigits(input.cpf);
    const sql = `SELECT * FROM candidatos WHERE cpf = ?${anoFiltro}
                 ORDER BY ano_eleicao DESC`;
    const params = input.ano ? [cpf, input.ano] : [cpf];

    candidaturas = db.query(sql).all(...(params as never[]));
  }

  const sqs = candidaturas
    .map((c) => (c as { sq_candidato?: string }).sq_candidato)
    .filter((v): v is string => Boolean(v));

  let bens: unknown[] = [];
  let totalBensDeclarado = 0;

  if (sqs.length > 0) {
    const placeholders = sqs.map(() => "?").join(",");
    const sql = `SELECT sq_candidato, ano_eleicao, ds_tipo_bem, ds_bem, vr_bem
                 FROM bens WHERE sq_candidato IN (${placeholders})
                 ORDER BY vr_bem DESC`;

    bens = db.query(sql).all(...(sqs as never[]));
    totalBensDeclarado = bens.reduce<number>(
      (acc, b) => acc + ((b as { vr_bem?: number }).vr_bem ?? 0),
      0
    );
  }

  return { candidaturas, bens, totalBensDeclarado };
}
