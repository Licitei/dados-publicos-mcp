/**
 * Funcoes de busca sobre o indice offline do PNCP (SQLite + FTS5).
 *
 * As funcoes "*Db" recebem um Database explicito e sao 100% testaveis com
 * Database(":memory:") populado a mao. As funcoes publicas sem "Db" abrem o
 * banco em getDataDir()/dados-publicos/pncp.db sob demanda (uso real).
 */

import { Database } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { existsSync } from "node:fs";
import { dominioPath } from "../../core/dataDir";
import { dadosPublicosErrors } from "./errors";
import { FTS_TABELAS, PNCP_DB_FILE, PNCP_DOMINIO, TABELAS } from "./pncp-catalog";

/** Canal de erro das funcoes de busca no indice offline (declarativo evlog). */
export type PncpServiceError = EvlogError;

/** Caminho do arquivo SQLite do indice offline. */
export function pncpDbPath(): string {
  return dominioPath(PNCP_DOMINIO, PNCP_DB_FILE);
}

/** Indica se o indice offline ja existe em disco. */
export function pncpDbExists(): boolean {
  return existsSync(pncpDbPath());
}

function openReadonly(): ResultType<Database, EvlogError> {
  if (!pncpDbExists()) {
    return Result.err(dadosPublicosErrors.INDICE_AUSENTE({ path: pncpDbPath() }));
  }
  return Result.try({
    try: () => new Database(pncpDbPath(), { readonly: true }),
    catch: (cause): EvlogError =>
      dadosPublicosErrors.INDICE_LEITURA({
        path: pncpDbPath(),
        internal: { cause: String(cause) },
      }),
  });
}

/**
 * Sanitiza um termo de busca do usuario para o sintaxe MATCH do FTS5,
 * envolvendo cada token em aspas duplas (evita erro de sintaxe com hifens,
 * barras, parenteses) e juntando com AND implicito.
 */
export function toFtsQuery(termo: string): string {
  const tokens = termo
    .normalize("NFKC")
    .split(/\s+/)
    .map((token) => token.replace(/"/g, "").trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return "\"\"";

  return tokens.map((token) => `"${token}"`).join(" ");
}

function clampLimit(limite: number | undefined, fallback = 25, max = 200) {
  if (!limite || !Number.isFinite(limite) || limite <= 0) return fallback;
  return Math.min(Math.floor(limite), max);
}

// ---------------------------------------------------------------------------
// buscar_pncp_local: FTS no objetoCompra / objetoContrato / objetoContratacao
// ---------------------------------------------------------------------------

export type BuscarLocalInput = {
  termo: string;
  entidade?: "contratacoes" | "contratos" | "atas" | "todas";
  uf?: string;
  limite?: number;
};

export function buscarPncpLocalDb(db: Database, input: BuscarLocalInput) {
  const match = toFtsQuery(input.termo);
  const limite = clampLimit(input.limite);
  const uf = input.uf ? input.uf.trim().toUpperCase() : null;
  const alvo = input.entidade ?? "todas";
  const out: Record<string, unknown[]> = {};

  if (alvo === "contratacoes" || alvo === "todas") {
    out.contratacoes = db
      .query(
        `SELECT c.numeroControlePNCP, c.objetoCompra, c.modalidadeNome,
                c.valorTotalEstimado, c.dataPublicacaoPncp, c.orgaoCnpj,
                c.orgaoRazaoSocial, c.municipioNome, c.ufSigla
         FROM "${FTS_TABELAS.contratacao}" f
         JOIN "${TABELAS.contratacao}" c ON c.rowid = f.rowid
         WHERE f."${FTS_TABELAS.contratacao}" MATCH $match
           AND ($uf IS NULL OR c.ufSigla = $uf)
         ORDER BY rank
         LIMIT $limite`
      )
      .all({ $match: match, $uf: uf, $limite: limite });
  }

  if (alvo === "contratos" || alvo === "todas") {
    out.contratos = db
      .query(
        `SELECT c.numeroControlePNCP, c.objetoContrato, c.nomeRazaoSocialFornecedor,
                c.niFornecedor, c.valorGlobal, c.dataPublicacaoPncp, c.orgaoCnpj,
                c.orgaoRazaoSocial, c.ufSigla
         FROM "${FTS_TABELAS.contrato}" f
         JOIN "${TABELAS.contrato}" c ON c.rowid = f.rowid
         WHERE f.objetoContrato MATCH $match
           AND ($uf IS NULL OR c.ufSigla = $uf)
         ORDER BY rank
         LIMIT $limite`
      )
      .all({ $match: match, $uf: uf, $limite: limite });
  }

  if (alvo === "atas" || alvo === "todas") {
    out.atas = db
      .query(
        `SELECT a.numeroControlePNCPAta, a.objetoContratacao, a.numeroAtaRegistroPreco,
                a.vigenciaInicio, a.vigenciaFim, a.cnpjOrgao, a.nomeOrgao, a.ufSigla
         FROM "${FTS_TABELAS.ata}" f
         JOIN "${TABELAS.ata}" a ON a.rowid = f.rowid
         WHERE f."${FTS_TABELAS.ata}" MATCH $match
           AND ($uf IS NULL OR a.ufSigla = $uf)
         ORDER BY rank
         LIMIT $limite`
      )
      .all({ $match: match, $uf: uf, $limite: limite });
  }

  const total = Object.values(out).reduce((sum, rows) => sum + rows.length, 0);

  return {
    meta: { termo: input.termo, match, entidade: alvo, uf, limite, total },
    results: out,
  };
}

export async function buscarPncpLocal(
  input: BuscarLocalInput
): Promise<ResultType<ReturnType<typeof buscarPncpLocalDb>, PncpServiceError>> {
  const db = openReadonly();
  if (Result.isError(db)) return db;
  try {
    return Result.ok(buscarPncpLocalDb(db.value, input));
  } finally {
    db.value.close();
  }
}

// ---------------------------------------------------------------------------
// fornecedor_pncp_por_nome: FTS no nomeRazaoSocialFornecedor -> contratos
// ---------------------------------------------------------------------------

export type FornecedorPorNomeInput = {
  nome: string;
  limite?: number;
};

export function fornecedorPncpPorNomeDb(
  db: Database,
  input: FornecedorPorNomeInput
) {
  const match = toFtsQuery(input.nome);
  const limite = clampLimit(input.limite);

  const fornecedores = db
    .query(
      `SELECT c.niFornecedor,
              c.nomeRazaoSocialFornecedor AS nome,
              COUNT(*) AS contratos,
              SUM(COALESCE(c.valorGlobal, c.valorInicial, 0)) AS valorTotal
       FROM "${FTS_TABELAS.contrato}" f
       JOIN "${TABELAS.contrato}" c ON c.rowid = f.rowid
       WHERE f.nomeRazaoSocialFornecedor MATCH $match
       GROUP BY c.niFornecedor, c.nomeRazaoSocialFornecedor
       ORDER BY valorTotal DESC
       LIMIT $limite`
    )
    .all({ $match: match, $limite: limite });

  return {
    meta: { nome: input.nome, match, limite, total: fornecedores.length },
    results: fornecedores,
  };
}

export async function fornecedorPncpPorNome(
  input: FornecedorPorNomeInput
): Promise<
  ResultType<ReturnType<typeof fornecedorPncpPorNomeDb>, PncpServiceError>
> {
  const db = openReadonly();
  if (Result.isError(db)) return db;
  try {
    return Result.ok(fornecedorPncpPorNomeDb(db.value, input));
  } finally {
    db.value.close();
  }
}

// ---------------------------------------------------------------------------
// contratos_do_fornecedor: niFornecedor (CNPJ/CPF) -> todos os contratos +
// agregacao de gasto por orgao / municipio / UF
// ---------------------------------------------------------------------------

export type ContratosDoFornecedorInput = {
  ni: string;
  limite?: number;
  agruparPor?: "orgao" | "municipio" | "uf" | "nenhum";
};

export function contratosDoFornecedorDb(
  db: Database,
  input: ContratosDoFornecedorInput
) {
  const ni = input.ni.replace(/\D/g, "");
  const limite = clampLimit(input.limite, 50);
  const agruparPor = input.agruparPor ?? "orgao";

  const contratos = db
    .query(
      `SELECT numeroControlePNCP, objetoContrato, nomeRazaoSocialFornecedor,
              niFornecedor, valorGlobal, valorInicial, dataAssinatura,
              dataVigenciaInicio, dataVigenciaFim, orgaoCnpj, orgaoRazaoSocial,
              codigoIbge, ufSigla
       FROM "${TABELAS.contrato}"
       WHERE niFornecedor = $ni
       ORDER BY COALESCE(valorGlobal, valorInicial, 0) DESC
       LIMIT $limite`
    )
    .all({ $ni: ni, $limite: limite });

  const totais = db
    .query(
      `SELECT COUNT(*) AS contratos,
              SUM(COALESCE(valorGlobal, valorInicial, 0)) AS valorTotal
       FROM "${TABELAS.contrato}"
       WHERE niFornecedor = $ni`
    )
    .get({ $ni: ni }) as { contratos: number; valorTotal: number | null };

  let agregacao: unknown[] = [];
  if (agruparPor === "orgao") {
    agregacao = db
      .query(
        `SELECT orgaoCnpj AS chave, orgaoRazaoSocial AS rotulo,
                COUNT(*) AS contratos,
                SUM(COALESCE(valorGlobal, valorInicial, 0)) AS valorTotal
         FROM "${TABELAS.contrato}"
         WHERE niFornecedor = $ni
         GROUP BY orgaoCnpj, orgaoRazaoSocial
         ORDER BY valorTotal DESC`
      )
      .all({ $ni: ni });
  } else if (agruparPor === "municipio") {
    agregacao = db
      .query(
        `SELECT codigoIbge AS chave, ufSigla AS rotulo,
                COUNT(*) AS contratos,
                SUM(COALESCE(valorGlobal, valorInicial, 0)) AS valorTotal
         FROM "${TABELAS.contrato}"
         WHERE niFornecedor = $ni
         GROUP BY codigoIbge, ufSigla
         ORDER BY valorTotal DESC`
      )
      .all({ $ni: ni });
  } else if (agruparPor === "uf") {
    agregacao = db
      .query(
        `SELECT ufSigla AS chave,
                COUNT(*) AS contratos,
                SUM(COALESCE(valorGlobal, valorInicial, 0)) AS valorTotal
         FROM "${TABELAS.contrato}"
         WHERE niFornecedor = $ni
         GROUP BY ufSigla
         ORDER BY valorTotal DESC`
      )
      .all({ $ni: ni });
  }

  return {
    meta: {
      ni,
      limite,
      agruparPor,
      totalContratos: totais.contratos ?? 0,
      valorTotal: totais.valorTotal ?? 0,
    },
    agregacao,
    results: contratos,
  };
}

export async function contratosDoFornecedor(
  input: ContratosDoFornecedorInput
): Promise<
  ResultType<ReturnType<typeof contratosDoFornecedorDb>, PncpServiceError>
> {
  const db = openReadonly();
  if (Result.isError(db)) return db;
  try {
    return Result.ok(contratosDoFornecedorDb(db.value, input));
  } finally {
    db.value.close();
  }
}

// ---------------------------------------------------------------------------
// alertas_pncp: editais novos contendo palavra-chave X em UF Y desde a ultima
// sincronizacao (dataAtualizacaoGlobal > desde)
// ---------------------------------------------------------------------------

export type AlertasInput = {
  termo: string;
  uf?: string;
  desde?: string;
  limite?: number;
};

export function alertasPncpDb(db: Database, input: AlertasInput) {
  const match = toFtsQuery(input.termo);
  const uf = input.uf ? input.uf.trim().toUpperCase() : null;
  const desde = input.desde ?? null;
  const limite = clampLimit(input.limite, 50);

  const results = db
    .query(
      `SELECT c.numeroControlePNCP, c.objetoCompra, c.modalidadeNome,
              c.situacaoCompraNome, c.valorTotalEstimado, c.dataPublicacaoPncp,
              c.dataAberturaProposta, c.dataEncerramentoProposta,
              c.dataAtualizacaoGlobal, c.orgaoCnpj, c.orgaoRazaoSocial,
              c.municipioNome, c.ufSigla
       FROM "${FTS_TABELAS.contratacao}" f
       JOIN "${TABELAS.contratacao}" c ON c.rowid = f.rowid
       WHERE f."${FTS_TABELAS.contratacao}" MATCH $match
         AND ($uf IS NULL OR c.ufSigla = $uf)
         AND ($desde IS NULL OR c.dataAtualizacaoGlobal > $desde)
       ORDER BY c.dataAtualizacaoGlobal DESC
       LIMIT $limite`
    )
    .all({ $match: match, $uf: uf, $desde: desde, $limite: limite });

  return {
    meta: { termo: input.termo, match, uf, desde, limite, total: results.length },
    results,
  };
}

export async function alertasPncp(
  input: AlertasInput
): Promise<ResultType<ReturnType<typeof alertasPncpDb>, PncpServiceError>> {
  const db = openReadonly();
  if (Result.isError(db)) return db;
  try {
    return Result.ok(alertasPncpDb(db.value, input));
  } finally {
    db.value.close();
  }
}
