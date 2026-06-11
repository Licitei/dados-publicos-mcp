import { Database } from "bun:sqlite";
import { normalize, onlyDigits } from "../../core/normalize";
import { parseNumeroBr } from "../../core/parse/numero-br";
import { parseDataBr } from "../../core/parse/data-br";

/**
 * Esquema SQLite do dominio tse-eleitoral.
 *
 * Tabelas indexadas (somente o agregado *_BRASIL.csv de cada ano):
 *  - candidatos                 (consulta_cand)
 *  - bens                       (bem_candidato)
 *  - receitas                   (doacoes)
 *  - receitas_doador_originario (cadeia de doacao)
 *  - despesas_contratadas       (fornecedores)
 *
 * Indices secundarios em CPF/CNPJ e SQ_*. FTS5 nos nomes de doador,
 * fornecedor e candidato para busca textual por nome/razao social.
 */

export const DB_FILE = "tse-eleitoral.db";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS candidatos (
  sq_candidato      TEXT,
  cpf               TEXT,
  nome              TEXT,
  nome_urna         TEXT,
  ano_eleicao       INTEGER,
  sg_uf             TEXT,
  sg_ue             TEXT,
  cd_cargo          TEXT,
  ds_cargo          TEXT,
  nr_partido        TEXT,
  sg_partido        TEXT,
  ds_sit_tot_turno  TEXT,
  dt_nascimento     TEXT,
  ds_ocupacao       TEXT
);

CREATE TABLE IF NOT EXISTS bens (
  sq_candidato      TEXT,
  ano_eleicao       INTEGER,
  sg_uf             TEXT,
  nr_ordem          TEXT,
  cd_tipo_bem       TEXT,
  ds_tipo_bem       TEXT,
  ds_bem            TEXT,
  vr_bem            REAL
);

CREATE TABLE IF NOT EXISTS receitas (
  sq_receita        TEXT,
  sq_candidato      TEXT,
  cpf_candidato     TEXT,
  ano_eleicao       INTEGER,
  cpf_cnpj_doador   TEXT,
  nome_doador       TEXT,
  nome_doador_rfb   TEXT,
  cd_cnae_doador    TEXT,
  ds_cnae_doador    TEXT,
  sg_uf_doador      TEXT,
  vr_receita        REAL,
  dt_receita        TEXT,
  ds_origem         TEXT,
  ds_natureza       TEXT,
  nr_recibo         TEXT
);

CREATE TABLE IF NOT EXISTS receitas_doador_originario (
  sq_receita        TEXT,
  ano_eleicao       INTEGER,
  cpf_cnpj_orig     TEXT,
  nome_orig         TEXT,
  nome_orig_rfb     TEXT,
  tp_orig           TEXT,
  cd_cnae_orig      TEXT,
  vr_receita        REAL,
  dt_receita        TEXT
);

CREATE TABLE IF NOT EXISTS despesas_contratadas (
  sq_despesa        TEXT,
  sq_candidato      TEXT,
  cpf_candidato     TEXT,
  ano_eleicao       INTEGER,
  cpf_cnpj_forn     TEXT,
  nome_forn         TEXT,
  nome_forn_rfb     TEXT,
  cd_cnae_forn      TEXT,
  ds_cnae_forn      TEXT,
  sg_uf_forn        TEXT,
  vr_despesa        REAL,
  dt_despesa        TEXT,
  ds_despesa        TEXT,
  nr_documento      TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  chave             TEXT PRIMARY KEY,
  valor             TEXT
);
`;

export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_cand_cpf        ON candidatos(cpf);
CREATE INDEX IF NOT EXISTS idx_cand_sq         ON candidatos(sq_candidato);
CREATE INDEX IF NOT EXISTS idx_bens_sq         ON bens(sq_candidato);
CREATE INDEX IF NOT EXISTS idx_rec_doador      ON receitas(cpf_cnpj_doador);
CREATE INDEX IF NOT EXISTS idx_rec_sq          ON receitas(sq_receita);
CREATE INDEX IF NOT EXISTS idx_rec_cand        ON receitas(sq_candidato);
CREATE INDEX IF NOT EXISTS idx_orig_cpf        ON receitas_doador_originario(cpf_cnpj_orig);
CREATE INDEX IF NOT EXISTS idx_orig_sq         ON receitas_doador_originario(sq_receita);
CREATE INDEX IF NOT EXISTS idx_desp_forn       ON despesas_contratadas(cpf_cnpj_forn);
CREATE INDEX IF NOT EXISTS idx_desp_sq         ON despesas_contratadas(sq_despesa);
CREATE INDEX IF NOT EXISTS idx_desp_cand       ON despesas_contratadas(sq_candidato);
`;

/**
 * Tabelas FTS5 para busca por nome. Cada linha do FTS espelha o rowid da
 * tabela base, permitindo JOIN por rowid apos o MATCH.
 */
export const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS receitas_fts USING fts5(
  nome_doador, nome_doador_rfb, content='receitas', content_rowid='rowid'
);
CREATE VIRTUAL TABLE IF NOT EXISTS despesas_fts USING fts5(
  nome_forn, nome_forn_rfb, content='despesas_contratadas', content_rowid='rowid'
);
CREATE VIRTUAL TABLE IF NOT EXISTS candidatos_fts USING fts5(
  nome, nome_urna, content='candidatos', content_rowid='rowid'
);
`;

/** Cria schema + indices num banco aberto. FTS e criado apos a carga. */
export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
  db.exec(INDEX_SQL);
}

/** (Re)constroi as tabelas FTS5 a partir do conteudo ja carregado. */
export function rebuildFts(db: Database): void {
  db.exec(FTS_SQL);
  db.exec(`INSERT INTO receitas_fts(receitas_fts) VALUES('rebuild');`);
  db.exec(`INSERT INTO despesas_fts(despesas_fts) VALUES('rebuild');`);
  db.exec(`INSERT INTO candidatos_fts(candidatos_fts) VALUES('rebuild');`);
}

// ---------------------------------------------------------------------------
// Funcoes PURAS de mapeamento: Record<string,string> (linha CSV) -> linha tipada
// para insercao. Testaveis sem rede, sem disco.
// ---------------------------------------------------------------------------

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];

    if (v !== undefined && v !== "") return v.trim();
  }

  return "";
}

/** Sentinela do TSE para campo ausente vira string vazia. */
function clean(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed === "#NULO#" ||
    trimmed === "#NULO" ||
    trimmed === "-1" ||
    trimmed === "#NE#" ||
    trimmed === "#NI#"
  ) {
    return "";
  }

  return trimmed;
}

function num(row: Record<string, string>, ...keys: string[]): number | null {
  return parseNumeroBr(pick(row, ...keys));
}

function intOf(row: Record<string, string>, ...keys: string[]): number | null {
  const v = parseNumeroBr(pick(row, ...keys));

  return v === null ? null : Math.trunc(v);
}

function data(row: Record<string, string>, ...keys: string[]): string {
  return parseDataBr(clean(pick(row, ...keys))) ?? "";
}

function digits(row: Record<string, string>, ...keys: string[]): string {
  return onlyDigits(clean(pick(row, ...keys)));
}

export type CandidatoRow = {
  sq_candidato: string;
  cpf: string;
  nome: string;
  nome_urna: string;
  ano_eleicao: number | null;
  sg_uf: string;
  sg_ue: string;
  cd_cargo: string;
  ds_cargo: string;
  nr_partido: string;
  sg_partido: string;
  ds_sit_tot_turno: string;
  dt_nascimento: string;
  ds_ocupacao: string;
};

export function mapCandidato(row: Record<string, string>): CandidatoRow {
  return {
    sq_candidato: clean(pick(row, "SQ_CANDIDATO")),
    cpf: digits(row, "NR_CPF_CANDIDATO"),
    nome: clean(pick(row, "NM_CANDIDATO")),
    nome_urna: clean(pick(row, "NM_URNA_CANDIDATO")),
    ano_eleicao: intOf(row, "ANO_ELEICAO"),
    sg_uf: clean(pick(row, "SG_UF")),
    sg_ue: clean(pick(row, "SG_UE")),
    cd_cargo: clean(pick(row, "CD_CARGO")),
    ds_cargo: clean(pick(row, "DS_CARGO")),
    nr_partido: clean(pick(row, "NR_PARTIDO")),
    sg_partido: clean(pick(row, "SG_PARTIDO")),
    ds_sit_tot_turno: clean(pick(row, "DS_SIT_TOT_TURNO")),
    dt_nascimento: data(row, "DT_NASCIMENTO"),
    ds_ocupacao: clean(pick(row, "DS_OCUPACAO")),
  };
}

export type BemRow = {
  sq_candidato: string;
  ano_eleicao: number | null;
  sg_uf: string;
  nr_ordem: string;
  cd_tipo_bem: string;
  ds_tipo_bem: string;
  ds_bem: string;
  vr_bem: number | null;
};

export function mapBem(row: Record<string, string>): BemRow {
  return {
    sq_candidato: clean(pick(row, "SQ_CANDIDATO")),
    ano_eleicao: intOf(row, "ANO_ELEICAO"),
    sg_uf: clean(pick(row, "SG_UF")),
    nr_ordem: clean(pick(row, "NR_ORDEM_BEM_CANDIDATO", "NR_ORDEM_CANDIDATO")),
    cd_tipo_bem: clean(pick(row, "CD_TIPO_BEM_CANDIDATO")),
    ds_tipo_bem: clean(pick(row, "DS_TIPO_BEM_CANDIDATO")),
    ds_bem: clean(pick(row, "DS_BEM_CANDIDATO")),
    vr_bem: num(row, "VR_BEM_CANDIDATO"),
  };
}

export type ReceitaRow = {
  sq_receita: string;
  sq_candidato: string;
  cpf_candidato: string;
  ano_eleicao: number | null;
  cpf_cnpj_doador: string;
  nome_doador: string;
  nome_doador_rfb: string;
  cd_cnae_doador: string;
  ds_cnae_doador: string;
  sg_uf_doador: string;
  vr_receita: number | null;
  dt_receita: string;
  ds_origem: string;
  ds_natureza: string;
  nr_recibo: string;
};

export function mapReceita(row: Record<string, string>): ReceitaRow {
  return {
    sq_receita: clean(pick(row, "SQ_RECEITA")),
    sq_candidato: clean(pick(row, "SQ_CANDIDATO")),
    cpf_candidato: digits(row, "NR_CPF_CANDIDATO"),
    ano_eleicao: intOf(row, "ANO_ELEICAO"),
    cpf_cnpj_doador: digits(row, "NR_CPF_CNPJ_DOADOR"),
    nome_doador: clean(pick(row, "NM_DOADOR")),
    nome_doador_rfb: clean(pick(row, "NM_DOADOR_RFB")),
    cd_cnae_doador: clean(pick(row, "CD_CNAE_DOADOR")),
    ds_cnae_doador: clean(pick(row, "DS_CNAE_DOADOR")),
    sg_uf_doador: clean(pick(row, "SG_UF_DOADOR")),
    vr_receita: num(row, "VR_RECEITA"),
    dt_receita: data(row, "DT_RECEITA"),
    ds_origem: clean(pick(row, "DS_ORIGEM_RECEITA")),
    ds_natureza: clean(pick(row, "DS_NATUREZA_RECEITA")),
    nr_recibo: clean(pick(row, "NR_RECIBO_DOACAO")),
  };
}

export type ReceitaOrigRow = {
  sq_receita: string;
  ano_eleicao: number | null;
  cpf_cnpj_orig: string;
  nome_orig: string;
  nome_orig_rfb: string;
  tp_orig: string;
  cd_cnae_orig: string;
  vr_receita: number | null;
  dt_receita: string;
};

export function mapReceitaOriginario(
  row: Record<string, string>,
): ReceitaOrigRow {
  return {
    sq_receita: clean(pick(row, "SQ_RECEITA")),
    ano_eleicao: intOf(row, "ANO_ELEICAO"),
    cpf_cnpj_orig: digits(row, "NR_CPF_CNPJ_DOADOR_ORIGINARIO"),
    nome_orig: clean(pick(row, "NM_DOADOR_ORIGINARIO")),
    nome_orig_rfb: clean(pick(row, "NM_DOADOR_ORIGINARIO_RFB")),
    tp_orig: clean(
      pick(row, "TP_DOADOR_ORIGINARIO", "DS_TP_DOADOR_ORIGINARIO"),
    ),
    cd_cnae_orig: clean(pick(row, "CD_CNAE_DOADOR_ORIGINARIO")),
    vr_receita: num(row, "VR_RECEITA"),
    dt_receita: data(row, "DT_RECEITA"),
  };
}

export type DespesaRow = {
  sq_despesa: string;
  sq_candidato: string;
  cpf_candidato: string;
  ano_eleicao: number | null;
  cpf_cnpj_forn: string;
  nome_forn: string;
  nome_forn_rfb: string;
  cd_cnae_forn: string;
  ds_cnae_forn: string;
  sg_uf_forn: string;
  vr_despesa: number | null;
  dt_despesa: string;
  ds_despesa: string;
  nr_documento: string;
};

export function mapDespesaContratada(row: Record<string, string>): DespesaRow {
  return {
    sq_despesa: clean(pick(row, "SQ_DESPESA")),
    sq_candidato: clean(pick(row, "SQ_CANDIDATO")),
    cpf_candidato: digits(row, "NR_CPF_CANDIDATO"),
    ano_eleicao: intOf(row, "ANO_ELEICAO"),
    cpf_cnpj_forn: digits(row, "NR_CPF_CNPJ_FORNECEDOR"),
    nome_forn: clean(pick(row, "NM_FORNECEDOR")),
    nome_forn_rfb: clean(pick(row, "NM_FORNECEDOR_RFB")),
    cd_cnae_forn: clean(pick(row, "CD_CNAE_FORNECEDOR")),
    ds_cnae_forn: clean(pick(row, "DS_CNAE_FORNECEDOR")),
    sg_uf_forn: clean(pick(row, "SG_UF_FORNECEDOR")),
    vr_despesa: num(row, "VR_DESPESA_CONTRATADA"),
    dt_despesa: data(row, "DT_DESPESA"),
    ds_despesa: clean(pick(row, "DS_DESPESA")),
    nr_documento: clean(pick(row, "NR_DOCUMENTO")),
  };
}

// ---------------------------------------------------------------------------
// SQL e binders de INSERT (usados com batchInsert do core).
// ---------------------------------------------------------------------------

export const INSERT_CANDIDATO = `INSERT INTO candidatos
 (sq_candidato,cpf,nome,nome_urna,ano_eleicao,sg_uf,sg_ue,cd_cargo,ds_cargo,nr_partido,sg_partido,ds_sit_tot_turno,dt_nascimento,ds_ocupacao)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export function bindCandidato(r: CandidatoRow): unknown[] {
  return [
    r.sq_candidato,
    r.cpf,
    r.nome,
    r.nome_urna,
    r.ano_eleicao,
    r.sg_uf,
    r.sg_ue,
    r.cd_cargo,
    r.ds_cargo,
    r.nr_partido,
    r.sg_partido,
    r.ds_sit_tot_turno,
    r.dt_nascimento,
    r.ds_ocupacao,
  ];
}

export const INSERT_BEM = `INSERT INTO bens
 (sq_candidato,ano_eleicao,sg_uf,nr_ordem,cd_tipo_bem,ds_tipo_bem,ds_bem,vr_bem)
 VALUES (?,?,?,?,?,?,?,?)`;

export function bindBem(r: BemRow): unknown[] {
  return [
    r.sq_candidato,
    r.ano_eleicao,
    r.sg_uf,
    r.nr_ordem,
    r.cd_tipo_bem,
    r.ds_tipo_bem,
    r.ds_bem,
    r.vr_bem,
  ];
}

export const INSERT_RECEITA = `INSERT INTO receitas
 (sq_receita,sq_candidato,cpf_candidato,ano_eleicao,cpf_cnpj_doador,nome_doador,nome_doador_rfb,cd_cnae_doador,ds_cnae_doador,sg_uf_doador,vr_receita,dt_receita,ds_origem,ds_natureza,nr_recibo)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export function bindReceita(r: ReceitaRow): unknown[] {
  return [
    r.sq_receita,
    r.sq_candidato,
    r.cpf_candidato,
    r.ano_eleicao,
    r.cpf_cnpj_doador,
    r.nome_doador,
    r.nome_doador_rfb,
    r.cd_cnae_doador,
    r.ds_cnae_doador,
    r.sg_uf_doador,
    r.vr_receita,
    r.dt_receita,
    r.ds_origem,
    r.ds_natureza,
    r.nr_recibo,
  ];
}

export const INSERT_RECEITA_ORIG = `INSERT INTO receitas_doador_originario
 (sq_receita,ano_eleicao,cpf_cnpj_orig,nome_orig,nome_orig_rfb,tp_orig,cd_cnae_orig,vr_receita,dt_receita)
 VALUES (?,?,?,?,?,?,?,?,?)`;

export function bindReceitaOrig(r: ReceitaOrigRow): unknown[] {
  return [
    r.sq_receita,
    r.ano_eleicao,
    r.cpf_cnpj_orig,
    r.nome_orig,
    r.nome_orig_rfb,
    r.tp_orig,
    r.cd_cnae_orig,
    r.vr_receita,
    r.dt_receita,
  ];
}

export const INSERT_DESPESA = `INSERT INTO despesas_contratadas
 (sq_despesa,sq_candidato,cpf_candidato,ano_eleicao,cpf_cnpj_forn,nome_forn,nome_forn_rfb,cd_cnae_forn,ds_cnae_forn,sg_uf_forn,vr_despesa,dt_despesa,ds_despesa,nr_documento)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export function bindDespesa(r: DespesaRow): unknown[] {
  return [
    r.sq_despesa,
    r.sq_candidato,
    r.cpf_candidato,
    r.ano_eleicao,
    r.cpf_cnpj_forn,
    r.nome_forn,
    r.nome_forn_rfb,
    r.cd_cnae_forn,
    r.ds_cnae_forn,
    r.sg_uf_forn,
    r.vr_despesa,
    r.dt_despesa,
    r.ds_despesa,
    r.nr_documento,
  ];
}

// Reexporta normalize p/ uso no service (busca por nome).
export { normalize };
