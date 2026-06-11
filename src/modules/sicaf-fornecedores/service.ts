import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { dominioPath } from "../../core/dataDir";
import { normalize, onlyDigits } from "../../core/normalize";
import { openDb, openReadonly } from "../../core/store/sqlite-store";
import { DB_FILE, DOMINIO } from "./catalog";
import { sicafErrors } from "./errors";
import { createSchema, totalFornecedores } from "./store";

export type SicafServiceError = EvlogError;

/** Representacao "saida" de um fornecedor (camelCase, voltado a tools). */
export type FornecedorView = {
  cnpj: string | null;
  cpf: string | null;
  nomeRazaoSocialFornecedor: string | null;
  ativo: boolean;
  habilitadoLicitar: boolean;
  ufSigla: string | null;
  nomeMunicipio: string | null;
  codigoCnae: number | null;
  nomeCnae: string | null;
  naturezaJuridicaNome: string | null;
  porteEmpresaNome: string | null;
};

type FornecedorRow = {
  cnpj: string | null;
  cpf: string | null;
  nome_razao_social: string | null;
  ativo: number;
  habilitado_licitar: number;
  uf_sigla: string | null;
  nome_municipio: string | null;
  codigo_cnae: number | null;
  nome_cnae: string | null;
  natureza_juridica_nome: string | null;
  porte_empresa_nome: string | null;
};

const SELECT_COLUMNS = `
  cnpj, cpf, nome_razao_social, ativo, habilitado_licitar,
  uf_sigla, nome_municipio, codigo_cnae, nome_cnae,
  natureza_juridica_nome, porte_empresa_nome
`;

// Mesmas colunas, qualificadas pelo alias `f` (usado em joins com o FTS,
// onde nome_razao_social existe tambem na tabela virtual).
const SELECT_COLUMNS_F = `
  f.cnpj, f.cpf, f.nome_razao_social, f.ativo, f.habilitado_licitar,
  f.uf_sigla, f.nome_municipio, f.codigo_cnae, f.nome_cnae,
  f.natureza_juridica_nome, f.porte_empresa_nome
`;

export function rowToView(row: FornecedorRow): FornecedorView {
  return {
    cnpj: row.cnpj,
    cpf: row.cpf,
    nomeRazaoSocialFornecedor: row.nome_razao_social,
    ativo: row.ativo === 1,
    habilitadoLicitar: row.habilitado_licitar === 1,
    ufSigla: row.uf_sigla,
    nomeMunicipio: row.nome_municipio,
    codigoCnae: row.codigo_cnae,
    nomeCnae: row.nome_cnae,
    naturezaJuridicaNome: row.natureza_juridica_nome,
    porteEmpresaNome: row.porte_empresa_nome,
  };
}

export function dbPath(): string {
  return dominioPath(DOMINIO, DB_FILE);
}

/**
 * Abre o banco do dominio (em disco). Falha com sicafErrors.INDICE_AUSENTE se o
 * arquivo ainda nao existe (rode a indexacao antes).
 */
function requireDb(): ResultType<Database, SicafServiceError> {
  const path = dbPath();

  if (!(Bun.file(path).size > 0)) {
    return Result.err(sicafErrors.INDICE_AUSENTE({ path }));
  }

  return Result.ok(openReadonly(DOMINIO, DB_FILE));
}

function clampLimite(
  limite: number | undefined,
  fallback: number,
  max: number,
) {
  if (!limite || limite < 1) return fallback;

  return Math.min(Math.trunc(limite), max);
}

/**
 * Transforma um termo de busca livre em uma query FTS5 segura por prefixo.
 * Cada token normalizado vira `"token"*` (match por prefixo) e os tokens sao
 * combinados com AND implicito. Retorna null se nao restar token util.
 */
export function buildFtsQuery(termo: string): string | null {
  const tokens = normalize(termo).split(" ").filter(Boolean);

  if (tokens.length === 0) return null;

  return tokens.map((t) => `"${t}"*`).join(" ");
}

export type BuscarFornecedorInput = {
  nome: string;
  apenasAtivos?: boolean;
  limite?: number;
};

/**
 * Busca fornecedores por nome / razao social usando FTS5 (full-text por
 * prefixo). Recurso que a API oficial NAO oferece.
 */
export function buscarFornecedor(
  input: BuscarFornecedorInput,
  database?: Database,
): ResultType<FornecedorView[], SicafServiceError> {
  const db = database ?? null;

  if (!db) {
    const opened = requireDb();

    if (Result.isError(opened)) return opened;

    return Result.ok(runBuscarFornecedor(opened.value, input));
  }

  return Result.ok(runBuscarFornecedor(db, input));
}

function runBuscarFornecedor(
  db: Database,
  input: BuscarFornecedorInput,
): FornecedorView[] {
  const ftsQuery = buildFtsQuery(input.nome);

  if (ftsQuery === null) return [];

  const limite = clampLimite(input.limite, 20, 100);
  const ativoFiltro = input.apenasAtivos ? "AND f.ativo = 1" : "";

  const rows = db
    .query(
      `SELECT ${SELECT_COLUMNS_F}
       FROM fornecedor_fts fts
       JOIN fornecedor f ON f.id = fts.rowid
       WHERE fornecedor_fts MATCH ?
       ${ativoFiltro}
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limite) as FornecedorRow[];

  return rows.map(rowToView);
}

export type FornecedorHabilitadoResult = {
  cnpj: string;
  encontrado: boolean;
  ativo: boolean;
  habilitadoLicitar: boolean;
  fornecedor: FornecedorView | null;
};

/**
 * Consulta por CNPJ (14 digitos) se o fornecedor esta ativo e habilitado a
 * licitar — offline, sem bater na API a cada consulta.
 */
export function fornecedorHabilitado(
  cnpjInput: string,
  database?: Database,
): ResultType<FornecedorHabilitadoResult, SicafServiceError> {
  const db = database ?? null;

  if (!db) {
    const opened = requireDb();

    if (Result.isError(opened)) return opened;

    return Result.ok(runFornecedorHabilitado(opened.value, cnpjInput));
  }

  return Result.ok(runFornecedorHabilitado(db, cnpjInput));
}

function runFornecedorHabilitado(
  db: Database,
  cnpjInput: string,
): FornecedorHabilitadoResult {
  const cnpj = onlyDigits(cnpjInput);

  const row = db
    .query(
      `SELECT ${SELECT_COLUMNS}
       FROM fornecedor
       WHERE cnpj = ?
       LIMIT 1`,
    )
    .get(cnpj) as FornecedorRow | null;

  if (!row) {
    return {
      cnpj,
      encontrado: false,
      ativo: false,
      habilitadoLicitar: false,
      fornecedor: null,
    };
  }

  const view = rowToView(row);

  return {
    cnpj,
    encontrado: true,
    ativo: view.ativo,
    habilitadoLicitar: view.habilitadoLicitar,
    fornecedor: view,
  };
}

export type ListarPorUfCnaeInput = {
  uf?: string;
  municipio?: string;
  cnae?: number;
  apenasAtivos?: boolean;
  limite?: number;
};

/**
 * Lista/segmenta fornecedores por UF, municipio e/ou CNAE — filtros que a API
 * oficial NAO expoe por UF/municipio.
 */
export function listarFornecedoresUfCnae(
  input: ListarPorUfCnaeInput,
  database?: Database,
): ResultType<FornecedorView[], SicafServiceError> {
  const db = database ?? null;

  if (!db) {
    const opened = requireDb();

    if (Result.isError(opened)) return opened;

    return Result.ok(runListarUfCnae(opened.value, input));
  }

  return Result.ok(runListarUfCnae(db, input));
}

function runListarUfCnae(
  db: Database,
  input: ListarPorUfCnaeInput,
): FornecedorView[] {
  const where: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (input.uf && input.uf.trim()) {
    where.push("uf_sigla = ?");
    params.push(input.uf.trim().toUpperCase());
  }

  if (input.municipio && input.municipio.trim()) {
    // Comparacao normalizada (sem acento/case) em SQL e custosa; usamos LIKE
    // case-insensitivo do SQLite sobre o municipio cru.
    where.push("nome_municipio LIKE ?");
    params.push(`%${input.municipio.trim()}%`);
  }

  if (typeof input.cnae === "number" && Number.isFinite(input.cnae)) {
    where.push("codigo_cnae = ?");
    params.push(Math.trunc(input.cnae));
  }

  if (input.apenasAtivos) {
    where.push("ativo = 1");
  }

  const limite = clampLimite(input.limite, 50, 500);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .query(
      `SELECT ${SELECT_COLUMNS}
       FROM fornecedor
       ${whereSql}
       ORDER BY nome_razao_social
       LIMIT ?`,
    )
    .all(...params, limite) as FornecedorRow[];

  return rows.map(rowToView);
}

export type SicafStatus = {
  caminho: string;
  existe: boolean;
  atualizadoEm: string | null;
  registros: number | null;
};

/** Status do indice local (existencia, mtime do arquivo, contagem). */
export async function statusSicaf(): Promise<SicafStatus> {
  const path = dbPath();
  const existe = Bun.file(path).size > 0;

  if (!existe) {
    return {
      caminho: path,
      existe: false,
      atualizadoEm: null,
      registros: null,
    };
  }

  const db = openDb(DOMINIO, DB_FILE);

  createSchema(db);
  const registros = totalFornecedores(db);
  const atualizadoEm = (await Bun.file(path).stat()).mtime.toISOString();

  return { caminho: path, existe: true, atualizadoEm, registros };
}
