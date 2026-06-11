import type { Database } from "bun:sqlite";
import { batchInsert, countRows } from "../../core/store/sqlite-store";
import { onlyDigits } from "../../core/normalize";

/**
 * Registro de fornecedor mapeado da resposta de
 * /modulo-fornecedor/1_consultarFornecedor (array `resultado`).
 *
 * CPF de pessoa fisica vem MASCARADO (ex.: '***007562**') — guardamos como
 * veio, mas nao da para buscar PF por CPF; PF so e localizavel por nome.
 * CNPJ de PJ vem completo (14 digitos).
 */
export type FornecedorRecord = {
  cnpj: string | null;
  cpf: string | null;
  nomeRazaoSocialFornecedor: string | null;
  ativo: boolean;
  habilitadoLicitar: boolean;
  ufSigla: string | null;
  nomeMunicipio: string | null;
  codigoCnae: number | null;
  nomeCnae: string | null;
  naturezaJuridicaId: number | null;
  naturezaJuridicaNome: string | null;
  porteEmpresaId: number | null;
  porteEmpresaNome: string | null;
};

/**
 * Item cru de `resultado[]` da API. Campos opcionais/nulaveis pois a API
 * mistura PF (cpf preenchido, cnpj null) e PJ (cnpj preenchido, cpf null).
 */
export type FornecedorRaw = {
  cnpj?: string | number | null;
  cpf?: string | null;
  nomeRazaoSocialFornecedor?: string | null;
  ativo?: boolean | string | number | null;
  habilitadoLicitar?: boolean | string | number | null;
  ufSigla?: string | null;
  nomeMunicipio?: string | null;
  codigoCnae?: number | string | null;
  nomeCnae?: string | null;
  naturezaJuridicaId?: number | string | null;
  naturezaJuridicaNome?: string | null;
  porteEmpresaId?: number | string | null;
  porteEmpresaNome?: string | null;
};

/** Envelope de resposta paginada da API. */
export type FornecedorPage = {
  resultado: FornecedorRaw[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes?: number;
};

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";

  return Boolean(value);
}

/**
 * Normaliza o CNPJ vindo da API para 14 digitos quando possivel.
 * Diferente de normalizeCnpj do core, NAO lanca: PF vem sem CNPJ, e alguns
 * registros podem vir com menos digitos — nesses casos retornamos null.
 */
export function normalizeCnpjLoose(value: unknown): string | null {
  const text = toStringOrNull(value);

  if (text === null) return null;

  const digits = onlyDigits(text);

  return digits.length === 14 ? digits : null;
}

/**
 * Mapeia um item cru de `resultado[]` para o registro persistido.
 */
export function mapFornecedor(raw: FornecedorRaw): FornecedorRecord {
  const uf = toStringOrNull(raw.ufSigla);

  return {
    cnpj: normalizeCnpjLoose(raw.cnpj),
    cpf: toStringOrNull(raw.cpf),
    nomeRazaoSocialFornecedor: toStringOrNull(raw.nomeRazaoSocialFornecedor),
    ativo: toBool(raw.ativo),
    habilitadoLicitar: toBool(raw.habilitadoLicitar),
    ufSigla: uf ? uf.toUpperCase() : null,
    nomeMunicipio: toStringOrNull(raw.nomeMunicipio),
    codigoCnae: toIntOrNull(raw.codigoCnae),
    nomeCnae: toStringOrNull(raw.nomeCnae),
    naturezaJuridicaId: toIntOrNull(raw.naturezaJuridicaId),
    naturezaJuridicaNome: toStringOrNull(raw.naturezaJuridicaNome),
    porteEmpresaId: toIntOrNull(raw.porteEmpresaId),
    porteEmpresaNome: toStringOrNull(raw.porteEmpresaNome),
  };
}

export const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS fornecedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj TEXT,
  cpf TEXT,
  nome_razao_social TEXT,
  ativo INTEGER NOT NULL DEFAULT 0,
  habilitado_licitar INTEGER NOT NULL DEFAULT 0,
  uf_sigla TEXT,
  nome_municipio TEXT,
  codigo_cnae INTEGER,
  nome_cnae TEXT,
  natureza_juridica_id INTEGER,
  natureza_juridica_nome TEXT,
  porte_empresa_id INTEGER,
  porte_empresa_nome TEXT
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_fornecedor_cnpj ON fornecedor(cnpj);
CREATE INDEX IF NOT EXISTS idx_fornecedor_uf ON fornecedor(uf_sigla);
CREATE INDEX IF NOT EXISTS idx_fornecedor_cnae ON fornecedor(codigo_cnae);
`;

/**
 * FTS5 externo (content=fornecedor) para busca por razao social/nome.
 * Triggers mantem o indice em sincronia com a tabela base.
 */
export const CREATE_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS fornecedor_fts USING fts5(
  nome_razao_social,
  content='fornecedor',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS fornecedor_ai AFTER INSERT ON fornecedor BEGIN
  INSERT INTO fornecedor_fts(rowid, nome_razao_social)
  VALUES (new.id, new.nome_razao_social);
END;

CREATE TRIGGER IF NOT EXISTS fornecedor_ad AFTER DELETE ON fornecedor BEGIN
  INSERT INTO fornecedor_fts(fornecedor_fts, rowid, nome_razao_social)
  VALUES ('delete', old.id, old.nome_razao_social);
END;

CREATE TRIGGER IF NOT EXISTS fornecedor_au AFTER UPDATE ON fornecedor BEGIN
  INSERT INTO fornecedor_fts(fornecedor_fts, rowid, nome_razao_social)
  VALUES ('delete', old.id, old.nome_razao_social);
  INSERT INTO fornecedor_fts(rowid, nome_razao_social)
  VALUES (new.id, new.nome_razao_social);
END;
`;

const INSERT_SQL = `
INSERT INTO fornecedor (
  cnpj, cpf, nome_razao_social, ativo, habilitado_licitar,
  uf_sigla, nome_municipio, codigo_cnae, nome_cnae,
  natureza_juridica_id, natureza_juridica_nome,
  porte_empresa_id, porte_empresa_nome
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Cria o schema completo (tabela + indices + FTS5 + triggers) no banco.
 * Idempotente (IF NOT EXISTS). Usavel tanto em disco quanto em :memory:.
 */
export function createSchema(db: Database): void {
  db.exec(CREATE_TABLE_SQL);
  db.exec(CREATE_INDEXES_SQL);
  db.exec(CREATE_FTS_SQL);
}

/** Remove todos os registros (e reseta a sequencia) para reindexacao limpa. */
export function resetTable(db: Database): void {
  db.exec("DELETE FROM fornecedor;");
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'fornecedor';");
}

/**
 * Insere registros em lote. O FTS5 e atualizado pelos triggers.
 */
export function insertFornecedores(
  db: Database,
  records: FornecedorRecord[]
): void {
  batchInsert(db, INSERT_SQL, records, (r) => [
    r.cnpj,
    r.cpf,
    r.nomeRazaoSocialFornecedor,
    r.ativo ? 1 : 0,
    r.habilitadoLicitar ? 1 : 0,
    r.ufSigla,
    r.nomeMunicipio,
    r.codigoCnae,
    r.nomeCnae,
    r.naturezaJuridicaId,
    r.naturezaJuridicaNome,
    r.porteEmpresaId,
    r.porteEmpresaNome,
  ]);
}

export function totalFornecedores(db: Database): number {
  return countRows(db, "fornecedor");
}
