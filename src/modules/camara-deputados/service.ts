/**
 * Funcoes de busca da Camara. Trabalham sobre uma Database SQLite ja populada.
 * As funcoes "*Db" recebem a Database (testaveis com :memory:); os wrappers
 * sem sufixo abrem o banco do dominio em disco e retornam Result.
 */
import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { openReadonly } from "../../core/store/sqlite-store";
import { onlyDigits, normalize } from "../../core/normalize";
import { dominioPath } from "../../core/dataDir";
import { DB_FILE, DOMINIO } from "./catalog";
import { camaraErrors } from "./errors";

export function dbPath(): string {
  return dominioPath(DOMINIO, DB_FILE);
}

/** Escapa um termo para uso seguro em uma MATCH de FTS5 (frase entre aspas). */
function ftsPhrase(termo: string): string {
  return `"${termo.replace(/"/g, '""')}"`;
}

/* ----------------------------- fornecedor_cota_parlamentar ---------------- */

export type FornecedorCotaInput = {
  cnpjCpf: string;
  ano?: number;
  limite?: number;
};

/**
 * Reverse-lookup: dado um CNPJ/CPF de fornecedor, lista todos os deputados que
 * lhe pagaram via CEAP + soma de vlrLiquido. A API oficial so faz por-deputado.
 */
export function fornecedorCotaParlamentarDb(
  db: Database,
  input: FornecedorCotaInput
) {
  const alvo = onlyDigits(input.cnpjCpf);
  const limite = Math.min(Math.max(input.limite ?? 50, 1), 500);
  const filtros = ["cnpj_cpf_norm = ?"];
  const params: SQLQueryBindings[] = [alvo];

  if (input.ano !== undefined) {
    filtros.push("num_ano = ?");
    params.push(input.ano);
  }

  const where = filtros.join(" AND ");

  const total = db
    .query(
      `SELECT COUNT(*) AS docs,
              SUM(vlr_liquido) AS total_liquido,
              MAX(txt_fornecedor) AS fornecedor
       FROM despesas WHERE ${where}`
    )
    .get(...params) as {
    docs: number;
    total_liquido: number | null;
    fornecedor: string | null;
  };

  const porDeputado = db
    .query(
      `SELECT nu_deputado_id AS deputadoId,
              MAX(nome_parlamentar) AS nomeParlamentar,
              MAX(sg_uf) AS uf,
              MAX(sg_partido) AS partido,
              COUNT(*) AS documentos,
              SUM(vlr_liquido) AS totalLiquido
       FROM despesas WHERE ${where}
       GROUP BY nu_deputado_id
       ORDER BY totalLiquido DESC
       LIMIT ?`
    )
    .all(...params, limite) as Array<Record<string, unknown>>;

  return {
    cnpjCpf: alvo,
    fornecedor: total.fornecedor ?? null,
    ano: input.ano ?? null,
    totalDocumentos: total.docs ?? 0,
    totalLiquido: total.total_liquido ?? 0,
    deputados: porDeputado,
  };
}

/* ------------------------------- gastos_por_fornecedor -------------------- */

export type GastosPorFornecedorInput = {
  fornecedor?: string;
  cnpjCpf?: string;
  ano?: number;
  categoria?: string;
  limite?: number;
};

/**
 * Agrega gasto CEAP por fornecedor, opcionalmente por ano e categoria
 * (txtDescricao). Aceita filtro por nome (FTS em txt_fornecedor) ou CNPJ/CPF.
 */
export function gastosPorFornecedorDb(
  db: Database,
  input: GastosPorFornecedorInput
) {
  const limite = Math.min(Math.max(input.limite ?? 50, 1), 500);
  const filtros: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (input.cnpjCpf) {
    filtros.push("d.cnpj_cpf_norm = ?");
    params.push(onlyDigits(input.cnpjCpf));
  }

  if (input.ano !== undefined) {
    filtros.push("d.num_ano = ?");
    params.push(input.ano);
  }

  if (input.categoria) {
    filtros.push("d.txt_descricao LIKE ?");
    params.push(`%${input.categoria}%`);
  }

  let from = "FROM despesas d";

  if (input.fornecedor) {
    // Usa FTS para casar o nome do fornecedor.
    from =
      "FROM despesas_fts f JOIN despesas d ON d.id = f.rowid";
    filtros.unshift("f.txt_fornecedor MATCH ?");
    params.unshift(ftsPhrase(input.fornecedor));
  }

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

  const linhas = db
    .query(
      `SELECT d.cnpj_cpf_norm AS cnpjCpf,
              MAX(d.txt_fornecedor) AS fornecedor,
              COUNT(*) AS documentos,
              SUM(d.vlr_liquido) AS totalLiquido
       ${from} ${where}
       GROUP BY d.cnpj_cpf_norm
       ORDER BY totalLiquido DESC
       LIMIT ?`
    )
    .all(...params, limite) as Array<Record<string, unknown>>;

  return { filtros: input, fornecedores: linhas };
}

/* --------------------------------- buscar_deputado ------------------------ */

export type BuscarDeputadoInput = {
  nome?: string;
  id?: number;
  uf?: string;
  limite?: number;
};

/** Busca deputado por nome/nome civil (normalizado) ou por id. */
export function buscarDeputadoDb(db: Database, input: BuscarDeputadoInput) {
  const limite = Math.min(Math.max(input.limite ?? 20, 1), 200);
  const filtros: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (input.id !== undefined) {
    filtros.push("id = ?");
    params.push(input.id);
  }

  if (input.nome) {
    filtros.push("nome_norm LIKE ?");
    params.push(`%${normalize(input.nome)}%`);
  }

  if (input.uf) {
    filtros.push("uf_nascimento = ?");
    params.push(input.uf.toUpperCase());
  }

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

  const linhas = db
    .query(
      `SELECT id, uri, nome, nome_civil AS nomeCivil, sigla_sexo AS siglaSexo,
              data_nascimento AS dataNascimento, uf_nascimento AS ufNascimento,
              municipio_nascimento AS municipioNascimento,
              id_legislatura_inicial AS idLegislaturaInicial,
              id_legislatura_final AS idLegislaturaFinal
       FROM deputados ${where}
       ORDER BY nome
       LIMIT ?`
    )
    .all(...params, limite) as Array<Record<string, unknown>>;

  return { filtros: input, deputados: linhas };
}

/* -------------------------------- buscar_proposicao ----------------------- */

export type BuscarProposicaoInput = {
  termo: string;
  ano?: number;
  tipo?: string;
  incluirAutores?: boolean;
  limite?: number;
};

/**
 * Busca proposicoes por palavra-chave em ementa/ementaDetalhada/keywords (FTS).
 * Opcionalmente inclui os autores de cada proposicao.
 */
export function buscarProposicaoDb(db: Database, input: BuscarProposicaoInput) {
  const limite = Math.min(Math.max(input.limite ?? 20, 1), 200);
  const filtros = ["proposicoes_fts MATCH ?"];
  const params: SQLQueryBindings[] = [ftsPhrase(input.termo)];

  if (input.ano !== undefined) {
    filtros.push("p.ano = ?");
    params.push(input.ano);
  }

  if (input.tipo) {
    filtros.push("p.sigla_tipo = ?");
    params.push(input.tipo.toUpperCase());
  }

  const where = filtros.join(" AND ");

  const linhas = db
    .query(
      `SELECT p.id, p.uri, p.sigla_tipo AS siglaTipo, p.numero, p.ano,
              p.ementa, p.keywords, p.data_apresentacao AS dataApresentacao,
              p.situacao
       FROM proposicoes_fts f JOIN proposicoes p ON p.id = f.rowid
       WHERE ${where}
       ORDER BY p.ano DESC, p.numero DESC
       LIMIT ?`
    )
    .all(...params, limite) as Array<Record<string, unknown>>;

  if (input.incluirAutores && linhas.length > 0) {
    const stmt = db.query(
      `SELECT id_deputado_autor AS idDeputadoAutor, nome_autor AS nomeAutor,
              proponente
       FROM proposicoes_autores WHERE id_proposicao = ?`
    );

    for (const linha of linhas) {
      linha.autores = stmt.all(linha.id as number);
    }
  }

  return { termo: input.termo, proposicoes: linhas };
}

/* --------------------------------- status --------------------------------- */

export function statusDb(db: Database) {
  const conta = (t: string) =>
    (db.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

  return {
    deputados: conta("deputados"),
    despesas: conta("despesas"),
    proposicoes: conta("proposicoes"),
    proposicoesAutores: conta("proposicoes_autores"),
  };
}

/* ------------------------------ wrappers em disco ------------------------- */

/** Abre o banco do dominio se existir; EvlogError do catalogo caso contrario. */
function requireDb(): ResultType<Database, EvlogError> {
  const caminho = dbPath();

  if (!(Bun.file(caminho).size > 0)) {
    return Result.err(camaraErrors.INDICE_AUSENTE({ caminho }));
  }

  // Handle readonly: o schema ja foi criado no build (guard acima garante o
  // arquivo). Nao roda DDL aqui (initDb escreveria num handle readonly).
  return Result.ok(openReadonly(DOMINIO, DB_FILE));
}

function comDb<T>(fn: (db: Database) => T): ResultType<T, EvlogError> {
  return requireDb().map(fn);
}

export function fornecedorCotaParlamentar(input: FornecedorCotaInput) {
  return comDb((db) => fornecedorCotaParlamentarDb(db, input));
}

export function gastosPorFornecedor(input: GastosPorFornecedorInput) {
  return comDb((db) => gastosPorFornecedorDb(db, input));
}

export function buscarDeputado(input: BuscarDeputadoInput) {
  return comDb((db) => buscarDeputadoDb(db, input));
}

export function buscarProposicao(input: BuscarProposicaoInput) {
  return comDb((db) => buscarProposicaoDb(db, input));
}

export function statusCamara() {
  const caminho = dbPath();

  if (!(Bun.file(caminho).size > 0)) {
    return Result.ok({
      existe: false,
      caminho,
      contagens: null as ReturnType<typeof statusDb> | null,
    });
  }

  return comDb((db) => ({
    existe: true,
    caminho,
    contagens: statusDb(db) as ReturnType<typeof statusDb> | null,
  }));
}
