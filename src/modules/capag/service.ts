/**
 * Servico de consulta do indice CAPAG (SQLite).
 *
 * Tabelas:
 * - capag_estados(uf, ano, ind1, nota1, ind2, nota2, ind3, nota3, capag, ...)
 * - capag_municipios(cod_ibge, nome, uf, ano_base, posicao, ind1, nota1, ...)
 * - siconfi_entes(cod_ibge, ente, uf, esfera, regiao, populacao, cnpj, exercicio)
 * - capag_municipios_fts (FTS5 sobre o nome do municipio)
 *
 * Indices secundarios: cod_ibge, uf, capag para filtros e rankings rapidos.
 */

import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { normalize, onlyDigits } from "../../core/normalize";
import { openDb } from "../../core/store/sqlite-store";
import { DB_FILE, DOMINIO } from "./catalog";
import { capagErrors } from "./errors";

/** DDL idempotente: cria tabelas, indices e o indice FTS5. */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS capag_estados (
      uf            TEXT NOT NULL,
      ano           INTEGER NOT NULL,
      indicador1    REAL,
      nota1         TEXT,
      indicador2    REAL,
      nota2         TEXT,
      indicador3    REAL,
      nota3         TEXT,
      capag         TEXT,
      qualidade_info TEXT,
      observacao    TEXT,
      PRIMARY KEY (uf, ano)
    );

    CREATE TABLE IF NOT EXISTS capag_municipios (
      cod_ibge      TEXT NOT NULL,
      nome          TEXT NOT NULL,
      uf            TEXT NOT NULL,
      ano_base      INTEGER NOT NULL,
      posicao       TEXT,
      indicador1    REAL,
      nota1         TEXT,
      indicador2    REAL,
      nota2         TEXT,
      indicador3    REAL,
      nota3         TEXT,
      capag         TEXT,
      PRIMARY KEY (cod_ibge, ano_base)
    );

    CREATE TABLE IF NOT EXISTS siconfi_entes (
      cod_ibge      TEXT NOT NULL,
      ente          TEXT NOT NULL,
      uf            TEXT,
      esfera        TEXT,
      regiao        TEXT,
      populacao     INTEGER,
      cnpj          TEXT,
      exercicio     INTEGER,
      PRIMARY KEY (cod_ibge)
    );

    CREATE INDEX IF NOT EXISTS idx_estados_capag ON capag_estados (capag);
    CREATE INDEX IF NOT EXISTS idx_mun_uf ON capag_municipios (uf);
    CREATE INDEX IF NOT EXISTS idx_mun_capag ON capag_municipios (capag);
    CREATE INDEX IF NOT EXISTS idx_mun_codibge ON capag_municipios (cod_ibge);
    CREATE INDEX IF NOT EXISTS idx_entes_cnpj ON siconfi_entes (cnpj);
    CREATE INDEX IF NOT EXISTS idx_entes_uf ON siconfi_entes (uf);

    CREATE VIRTUAL TABLE IF NOT EXISTS capag_municipios_fts USING fts5 (
      cod_ibge UNINDEXED,
      nome,
      uf UNINDEXED,
      content=''
    );
  `);
}

/** Abre o banco do dominio CAPAG (cria se necessario) e garante o schema. */
export function openCapagDb(): Database {
  const db = openDb(DOMINIO, DB_FILE);

  createSchema(db);

  return db;
}

// ----------------------- tipos de retorno -----------------------

export type EnteCapag = {
  tipo: "estado" | "municipio";
  cod_ibge: string | null;
  nome: string;
  uf: string;
  ano: number;
  posicao?: string | null;
  capag: string | null;
  indicadores: {
    endividamento: { valor: number | null; nota: string | null };
    poupanca_corrente: { valor: number | null; nota: string | null };
    liquidez: { valor: number | null; nota: string | null };
  };
};

type EstadoRowDb = {
  uf: string;
  ano: number;
  indicador1: number | null;
  nota1: string | null;
  indicador2: number | null;
  nota2: string | null;
  indicador3: number | null;
  nota3: string | null;
  capag: string | null;
};

type MunRowDb = {
  cod_ibge: string;
  nome: string;
  uf: string;
  ano_base: number;
  posicao: string | null;
  indicador1: number | null;
  nota1: string | null;
  indicador2: number | null;
  nota2: string | null;
  indicador3: number | null;
  nota3: string | null;
  capag: string | null;
};

function estadoToEnte(r: EstadoRowDb): EnteCapag {
  return {
    tipo: "estado",
    cod_ibge: null,
    nome: r.uf,
    uf: r.uf,
    ano: r.ano,
    capag: r.capag,
    indicadores: {
      endividamento: { valor: r.indicador1, nota: r.nota1 },
      poupanca_corrente: { valor: r.indicador2, nota: r.nota2 },
      liquidez: { valor: r.indicador3, nota: r.nota3 },
    },
  };
}

function munToEnte(r: MunRowDb): EnteCapag {
  return {
    tipo: "municipio",
    cod_ibge: r.cod_ibge,
    nome: r.nome,
    uf: r.uf,
    ano: r.ano_base,
    posicao: r.posicao,
    capag: r.capag,
    indicadores: {
      endividamento: { valor: r.indicador1, nota: r.nota1 },
      poupanca_corrente: { valor: r.indicador2, nota: r.nota2 },
      liquidez: { valor: r.indicador3, nota: r.nota3 },
    },
  };
}

// ----------------------- consultas (tool capag_ente) -----------------------

export type CapagEnteInput = {
  /** Codigo IBGE de 7 digitos (municipio). */
  codIbge?: string;
  /** Nome do municipio (usado com uf). */
  nome?: string;
  /** Sigla UF: estado (sem nome) ou filtro do municipio (com nome). */
  uf?: string;
  /** Ano-base; quando omitido usa o mais recente disponivel. */
  ano?: number;
};

/**
 * Resolve a CAPAG de um ente: por cod_ibge, por nome+uf (municipio) ou por uf
 * isolada (estado). Retorna a posicao mais recente quando `ano` nao for dado.
 */
export function capagEnte(
  db: Database,
  input: CapagEnteInput
): ResultType<EnteCapag | null, EvlogError> {
  return Result.gen(function* () {
    if (input.codIbge) {
      const cod = onlyDigits(input.codIbge).padStart(7, "0");

      return consultar(() => queryMunicipioByCod(db, cod, input.ano));
    }

    if (input.nome) {
      return consultar(() =>
        queryMunicipioByNome(db, input.nome!, input.uf, input.ano)
      );
    }

    if (input.uf) {
      return consultar(() => queryEstado(db, input.uf!, input.ano));
    }

    return Result.err(
      capagErrors.ENTRADA_INVALIDA({
        detalhe: "Informe cod_ibge, nome (com uf) ou uf.",
      })
    );
  });
}

/** Embrulha uma consulta SQLite sincrona, mapeando excecoes para EvlogError. */
function consultar<T>(fn: () => T): ResultType<T, EvlogError> {
  return Result.try({
    try: fn as () => Awaited<T>,
    catch: (cause): EvlogError =>
      capagErrors.CONSULTA({ internal: { cause: String(cause) } }),
  }) as ResultType<T, EvlogError>;
}

function queryMunicipioByCod(
  db: Database,
  cod: string,
  ano?: number
): EnteCapag | null {
  const sql = ano
    ? `SELECT * FROM capag_municipios WHERE cod_ibge = ? AND ano_base = ?`
    : `SELECT * FROM capag_municipios WHERE cod_ibge = ? ORDER BY ano_base DESC LIMIT 1`;
  const row = (ano
    ? db.query(sql).get(cod, ano)
    : db.query(sql).get(cod)) as MunRowDb | null;

  return row ? munToEnte(row) : null;
}

function queryMunicipioByNome(
  db: Database,
  nome: string,
  uf?: string,
  ano?: number
): EnteCapag | null {
  const alvo = normalize(nome);
  const params: SQLQueryBindings[] = [];
  let sql = `SELECT * FROM capag_municipios WHERE 1=1`;

  if (uf) {
    sql += ` AND uf = ?`;
    params.push(uf.trim().toUpperCase());
  }

  if (ano) {
    sql += ` AND ano_base = ?`;
    params.push(ano);
  }

  sql += ` ORDER BY ano_base DESC`;

  const rows = db.query(sql).all(...params) as MunRowDb[];
  // Match exato normalizado primeiro; senao, prefixo.
  const exact = rows.find((r) => normalize(r.nome) === alvo);
  const prefix = rows.find((r) => normalize(r.nome).startsWith(alvo));
  const chosen = exact ?? prefix ?? null;

  return chosen ? munToEnte(chosen) : null;
}

function queryEstado(db: Database, uf: string, ano?: number): EnteCapag | null {
  const sigla = uf.trim().toUpperCase();
  const sql = ano
    ? `SELECT * FROM capag_estados WHERE uf = ? AND ano = ?`
    : `SELECT * FROM capag_estados WHERE uf = ? ORDER BY ano DESC LIMIT 1`;
  const row = (ano
    ? db.query(sql).get(sigla, ano)
    : db.query(sql).get(sigla)) as EstadoRowDb | null;

  return row ? estadoToEnte(row) : null;
}

// ----------------------- tool entes_por_nota -----------------------

export type EntesPorNotaInput = {
  /** Notas alvo (ex.: ['C','D']). */
  notas: string[];
  /** Filtro por UF (municipios) ou sigla (estados). */
  uf?: string;
  /** Filtro por regiao SICONFI (N, NE, SE, S, CO) — so municipios via join. */
  regiao?: string;
  ano?: number;
  /** Inclui estados (default true) e municipios (default true). */
  incluirEstados?: boolean;
  incluirMunicipios?: boolean;
  limite?: number;
};

/** Lista entes (estados e/ou municipios) com nota CAPAG em `notas`. */
export function entesPorNota(
  db: Database,
  input: EntesPorNotaInput
): ResultType<EnteCapag[], EvlogError> {
  return Result.gen(function* () {
    const notas = input.notas.map((n) => n.trim()).filter(Boolean);

    if (notas.length === 0) {
      return Result.err(
        capagErrors.ENTRADA_INVALIDA({ detalhe: "Informe ao menos uma nota." })
      );
    }

    return consultar(() => {
      const placeholders = notas.map(() => "?").join(", ");
      const limite = clampLimite(input.limite, 500);
      const incluirEstados = input.incluirEstados ?? true;
      const incluirMunicipios = input.incluirMunicipios ?? true;
      const out: EnteCapag[] = [];

      if (incluirEstados) {
        const params: SQLQueryBindings[] = [...notas];
        let sql = `SELECT * FROM capag_estados WHERE capag IN (${placeholders})`;

        if (input.uf) {
          sql += ` AND uf = ?`;
          params.push(input.uf.trim().toUpperCase());
        }

        if (input.ano) {
          sql += ` AND ano = ?`;
          params.push(input.ano);
        } else {
          sql += ` AND ano = (SELECT MAX(ano) FROM capag_estados e2 WHERE e2.uf = capag_estados.uf)`;
        }

        sql += ` ORDER BY uf`;
        const rows = db.query(sql).all(...params) as EstadoRowDb[];

        for (const r of rows) out.push(estadoToEnte(r));
      }

      if (incluirMunicipios) {
        const params: SQLQueryBindings[] = [...notas];
        const useRegiao = Boolean(input.regiao);
        let sql = useRegiao
          ? `SELECT m.* FROM capag_municipios m
               JOIN siconfi_entes e ON e.cod_ibge = m.cod_ibge
               WHERE m.capag IN (${placeholders})`
          : `SELECT * FROM capag_municipios WHERE capag IN (${placeholders})`;
        const tableAlias = useRegiao ? "m." : "";

        if (input.uf) {
          sql += ` AND ${tableAlias}uf = ?`;
          params.push(input.uf.trim().toUpperCase());
        }

        if (useRegiao) {
          sql += ` AND e.regiao = ?`;
          params.push(input.regiao!.trim().toUpperCase());
        }

        if (input.ano) {
          sql += ` AND ${tableAlias}ano_base = ?`;
          params.push(input.ano);
        } else {
          sql += ` AND ${tableAlias}ano_base = (SELECT MAX(ano_base) FROM capag_municipios)`;
        }

        sql += ` ORDER BY ${tableAlias}uf, ${tableAlias}nome LIMIT ?`;
        params.push(limite);

        const rows = db.query(sql).all(...params) as MunRowDb[];

        for (const r of rows) out.push(munToEnte(r));
      }

      return out.slice(0, limite);
    });
  });
}

// ----------------------- tool capag_serie_historica -----------------------

export type SerieInput = {
  codIbge?: string;
  nome?: string;
  uf?: string;
};

export type SeriePonto = {
  ano: number;
  posicao?: string | null;
  capag: string | null;
};

export type SerieHistorica = {
  tipo: "estado" | "municipio";
  cod_ibge: string | null;
  nome: string;
  uf: string;
  serie: SeriePonto[];
};

/** Serie historica da nota CAPAG de um ente (todos os anos disponiveis). */
export function capagSerieHistorica(
  db: Database,
  input: SerieInput
): ResultType<SerieHistorica | null, EvlogError> {
  return Result.gen(function* () {
    if (!input.codIbge && !input.nome && !input.uf) {
      return Result.err(
        capagErrors.ENTRADA_INVALIDA({ detalhe: "Informe cod_ibge, nome ou uf." })
      );
    }

    return consultar(() => {
      if (input.codIbge || input.nome) {
        const cod = input.codIbge
          ? onlyDigits(input.codIbge).padStart(7, "0")
          : queryMunicipioByNome(db, input.nome!, input.uf)?.cod_ibge ?? null;

        if (!cod) return null;

        const rows = db
          .query(
            `SELECT * FROM capag_municipios WHERE cod_ibge = ? ORDER BY ano_base ASC, posicao ASC`
          )
          .all(cod) as MunRowDb[];

        if (rows.length === 0) return null;

        const identity = rows[rows.length - 1];

        return {
          tipo: "municipio" as const,
          cod_ibge: identity.cod_ibge,
          nome: identity.nome,
          uf: identity.uf,
          serie: rows.map((r) => ({
            ano: r.ano_base,
            posicao: r.posicao,
            capag: r.capag,
          })),
        };
      }

      if (input.uf) {
        const sigla = input.uf.trim().toUpperCase();
        const rows = db
          .query(`SELECT * FROM capag_estados WHERE uf = ? ORDER BY ano ASC`)
          .all(sigla) as EstadoRowDb[];

        if (rows.length === 0) return null;

        return {
          tipo: "estado" as const,
          cod_ibge: null,
          nome: sigla,
          uf: sigla,
          serie: rows.map((r) => ({ ano: r.ano, capag: r.capag })),
        };
      }

      return null;
    });
  });
}

// ----------------------- tool resolver_ente_por_cnpj -----------------------

export type ResolverCnpjResult = {
  cnpj: string;
  encontrado: boolean;
  cod_ibge: string | null;
  ente: string | null;
  uf: string | null;
  esfera: string | null;
  capag: EnteCapag | null;
  observacao: string;
};

/**
 * Resolve o CNPJ do orgao contratante para cod_ibge/municipio/UF via /entes
 * (ponte do SICONFI) e anexa a CAPAG mais recente do ente. O CNPJ ali e o da
 * prefeitura/governo; autarquias/orgaos especificos nao casam (fallback manual
 * por UF fica a cargo do consumidor — devolvemos encontrado=false).
 */
export function resolverEntePorCnpj(
  db: Database,
  cnpjRaw: string
): ResultType<ResolverCnpjResult, EvlogError> {
  return Result.gen(function* () {
    const cnpj = onlyDigits(cnpjRaw);

    if (cnpj.length !== 14) {
      return Result.err(capagErrors.CNPJ_INVALIDO({ cnpj: cnpjRaw }));
    }

    return consultar(() => {
      const ente = db
        .query(
          `SELECT cod_ibge, ente, uf, esfera FROM siconfi_entes WHERE cnpj = ? LIMIT 1`
        )
        .get(cnpj) as
        | { cod_ibge: string; ente: string; uf: string; esfera: string }
        | null;

      if (!ente) {
        return {
          cnpj,
          encontrado: false,
          cod_ibge: null,
          ente: null,
          uf: null,
          esfera: null,
          capag: null,
          observacao:
            "CNPJ nao encontrado em /entes (provavel autarquia/orgao especifico). Use o municipio/UF da licitacao para o fallback.",
        };
      }

      const capag: EnteCapag | null =
        ente.esfera === "M"
          ? queryMunicipioByCod(db, ente.cod_ibge)
          : ente.esfera === "E"
            ? queryEstado(db, ente.uf)
            : null;

      return {
        cnpj,
        encontrado: true,
        cod_ibge: ente.cod_ibge,
        ente: ente.ente,
        uf: ente.uf,
        esfera: ente.esfera,
        capag,
        observacao:
          "CNPJ resolvido a nivel prefeitura/governo. CAPAG mede a saude fiscal do COMPRADOR publico.",
      };
    });
  });
}

// ----------------------- status -----------------------

export type CapagCounts = {
  estados: number;
  municipios: number;
  entes: number;
  anosEstados: number[];
  anosMunicipios: number[];
};

export function countCapag(db: Database): CapagCounts {
  const estados = (db.query(`SELECT COUNT(*) AS n FROM capag_estados`).get() as {
    n: number;
  }).n;
  const municipios = (db
    .query(`SELECT COUNT(*) AS n FROM capag_municipios`)
    .get() as { n: number }).n;
  const entes = (db.query(`SELECT COUNT(*) AS n FROM siconfi_entes`).get() as {
    n: number;
  }).n;
  const anosEstados = (db
    .query(`SELECT DISTINCT ano FROM capag_estados ORDER BY ano`)
    .all() as { ano: number }[]).map((r) => r.ano);
  const anosMunicipios = (db
    .query(`SELECT DISTINCT ano_base AS ano FROM capag_municipios ORDER BY ano_base`)
    .all() as { ano: number }[]).map((r) => r.ano);

  return { estados, municipios, entes, anosEstados, anosMunicipios };
}

function clampLimite(limite: number | undefined, max: number): number {
  if (!limite || limite < 1) return max;

  return Math.min(limite, max);
}
