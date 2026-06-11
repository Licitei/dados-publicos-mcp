/**
 * Funcoes de busca da fonte receita-cnpj.
 *
 * As funcoes de consulta recebem um Database (bun:sqlite) explicito ->
 * testaveis com Database(":memory:"). As tools usam withDb() para abrir o
 * banco em disco sob demanda.
 */

import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { normalize, onlyDigits } from "../../core/normalize";
import { dbExists, openDb } from "../../core/store/sqlite-store";
import { dominioPath } from "../../core/dataDir";
import {
  IDENTIFICADOR_SOCIO,
  MATRIZ_FILIAL,
  PORTE_EMPRESA,
  RECEITA_CNPJ_KEY,
  SITUACAO_CADASTRAL,
} from "./catalog";
import { receitaCnpjErrors } from "./errors";

export const DB_FILE = "receita-cnpj.db";

/** Canal de erro recuperavel do dominio (catalogo evlog). */
export type ServiceError = EvlogError;

/** Caminho do banco em disco. */
export function dbPath(): string {
  return dominioPath(RECEITA_CNPJ_KEY, DB_FILE);
}

/**
 * Abre o banco em disco e executa fn. Devolve INDICE_AUSENTE quando o
 * banco ainda nao foi construido (build()).
 */
export async function withDb<T>(
  fn: (db: Database) => T
): Promise<ResultType<T, EvlogError>> {
  return Result.gen(function* () {
    if (!dbExists(RECEITA_CNPJ_KEY, DB_FILE)) {
      return yield* Result.err(
        receitaCnpjErrors.INDICE_AUSENTE({ path: dbPath() })
      );
    }

    const db = openDb(RECEITA_CNPJ_KEY, DB_FILE);

    try {
      return Result.ok(fn(db));
    } finally {
      db.close();
    }
  });
}

function descricaoSituacao(codigo: string): string {
  return SITUACAO_CADASTRAL[codigo] ?? SITUACAO_CADASTRAL[codigo.padStart(2, "0")] ?? "desconhecida";
}

function descricaoDominio(db: Database, tabela: string, codigo: string): string | null {
  if (!codigo) return null;
  const row = db
    .query("SELECT descricao FROM dominios WHERE tabela = ? AND codigo = ? LIMIT 1")
    .get(tabela, codigo) as { descricao: string } | undefined;
  return row?.descricao ?? null;
}

type EstabelecimentoDb = {
  cnpj_completo: string;
  cnpj_basico: string;
  identificador_matriz_filial: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  data_situacao_cadastral: string | null;
  motivo_situacao_cadastral: string;
  data_inicio_atividade: string | null;
  cnae_fiscal_principal: string;
  cnae_fiscal_secundaria: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  ddd1: string;
  telefone1: string;
  correio_eletronico: string;
};

type EmpresaDb = {
  cnpj_basico: string;
  razao_social: string;
  natureza_juridica: string;
  capital_social: number | null;
  porte_empresa: string;
};

/**
 * Consulta um CNPJ completo (14 digitos) e devolve a ficha do
 * estabelecimento + empresa + Simples/MEI.
 */
export function consultarCnpj(
  db: Database,
  cnpj: string
): ResultType<Record<string, unknown> | null, EvlogError> {
  // Validacao recuperavel inline: CNPJ precisa ter 14 digitos. (normalizeCnpj
  // do core panica em invariante, entao validamos aqui para devolver um erro
  // recuperavel pelo catalogo.)
  const normalizado = onlyDigits(cnpj);
  if (!/^\d{14}$/.test(normalizado)) {
    return Result.err(receitaCnpjErrors.CNPJ_INVALIDO({ cnpj }));
  }

  const estab = db
    .query(
      `SELECT cnpj_completo, cnpj_basico, identificador_matriz_filial, nome_fantasia,
              situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral,
              data_inicio_atividade, cnae_fiscal_principal, cnae_fiscal_secundaria,
              logradouro, numero, complemento, bairro, cep, uf, municipio,
              ddd1, telefone1, correio_eletronico
       FROM estabelecimentos WHERE cnpj_completo = ? LIMIT 1`
    )
    .get(normalizado) as EstabelecimentoDb | undefined;

  if (!estab) return Result.ok(null);

  const empresa = db
    .query(
      `SELECT cnpj_basico, razao_social, natureza_juridica, capital_social, porte_empresa
       FROM empresas WHERE cnpj_basico = ? LIMIT 1`
    )
    .get(estab.cnpj_basico) as EmpresaDb | undefined;

  const simples = db
    .query(
      `SELECT opcao_simples, data_opcao_simples, opcao_mei, data_opcao_mei
       FROM simples WHERE cnpj_basico = ? LIMIT 1`
    )
    .get(estab.cnpj_basico) as
    | { opcao_simples: string; data_opcao_simples: string | null; opcao_mei: string; data_opcao_mei: string | null }
    | undefined;

  return Result.ok({
    cnpj: estab.cnpj_completo,
    cnpj_basico: estab.cnpj_basico,
    razao_social: empresa?.razao_social ?? null,
    nome_fantasia: estab.nome_fantasia || null,
    matriz_filial: MATRIZ_FILIAL[estab.identificador_matriz_filial] ?? estab.identificador_matriz_filial,
    situacao_cadastral: descricaoSituacao(estab.situacao_cadastral),
    situacao_cadastral_codigo: estab.situacao_cadastral,
    data_situacao_cadastral: estab.data_situacao_cadastral,
    motivo_situacao_cadastral: descricaoDominio(db, "motivos", estab.motivo_situacao_cadastral),
    data_inicio_atividade: estab.data_inicio_atividade,
    cnae_principal: estab.cnae_fiscal_principal,
    cnae_principal_descricao: descricaoDominio(db, "cnaes", estab.cnae_fiscal_principal),
    cnae_secundaria: estab.cnae_fiscal_secundaria
      ? estab.cnae_fiscal_secundaria.split(",").map((c) => c.trim()).filter(Boolean)
      : [],
    natureza_juridica: empresa?.natureza_juridica ?? null,
    natureza_juridica_descricao: empresa
      ? descricaoDominio(db, "naturezas", empresa.natureza_juridica)
      : null,
    capital_social: empresa?.capital_social ?? null,
    porte: empresa ? PORTE_EMPRESA[empresa.porte_empresa] ?? empresa.porte_empresa : null,
    endereco: {
      logradouro: estab.logradouro,
      numero: estab.numero,
      complemento: estab.complemento,
      bairro: estab.bairro,
      cep: estab.cep,
      municipio_codigo_rfb: estab.municipio,
      municipio: descricaoDominio(db, "municipios", estab.municipio),
      uf: estab.uf,
    },
    contato: {
      ddd1: estab.ddd1,
      telefone1: estab.telefone1,
      email: estab.correio_eletronico,
    },
    simples: {
      opcao_simples: simples?.opcao_simples ?? null,
      data_opcao_simples: simples?.data_opcao_simples ?? null,
      opcao_mei: simples?.opcao_mei ?? null,
      data_opcao_mei: simples?.data_opcao_mei ?? null,
    },
  });
}

/**
 * Constroi uma query FTS5 segura (prefix match por token) a partir de texto
 * livre. Escapa aspas e ignora tokens vazios.
 */
function ftsQuery(termo: string): string {
  const tokens = normalize(termo).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
}

/** Busca empresas por razao social / nome fantasia (FTS5). */
export function buscarEmpresaPorNome(
  db: Database,
  termo: string,
  limite = 20
): Record<string, unknown>[] {
  const query = ftsQuery(termo);
  if (!query) return [];
  const lim = Math.min(Math.max(limite, 1), 100);

  // Empresas por razao social.
  const porRazao = db
    .query(
      `SELECT e.cnpj_basico, e.razao_social, e.porte_empresa
       FROM empresas_fts f JOIN empresas e ON e.cnpj_basico = f.cnpj_basico
       WHERE empresas_fts MATCH ? LIMIT ?`
    )
    .all(query, lim) as { cnpj_basico: string; razao_social: string; porte_empresa: string }[];

  const resultados: Record<string, unknown>[] = [];
  const vistos = new Set<string>();

  for (const r of porRazao) {
    if (vistos.has(r.cnpj_basico)) continue;
    vistos.add(r.cnpj_basico);

    const matriz = db
      .query(
        `SELECT cnpj_completo, nome_fantasia, situacao_cadastral, uf, municipio
         FROM estabelecimentos WHERE cnpj_basico = ?
         ORDER BY identificador_matriz_filial ASC LIMIT 1`
      )
      .get(r.cnpj_basico) as
      | { cnpj_completo: string; nome_fantasia: string; situacao_cadastral: string; uf: string; municipio: string }
      | undefined;

    resultados.push({
      cnpj_basico: r.cnpj_basico,
      cnpj: matriz?.cnpj_completo ?? null,
      razao_social: r.razao_social,
      nome_fantasia: matriz?.nome_fantasia ?? null,
      porte: PORTE_EMPRESA[r.porte_empresa] ?? r.porte_empresa,
      situacao_cadastral: matriz ? descricaoSituacao(matriz.situacao_cadastral) : null,
      uf: matriz?.uf ?? null,
    });
    if (resultados.length >= lim) break;
  }

  // Tambem por nome fantasia.
  if (resultados.length < lim) {
    const porFantasia = db
      .query(
        `SELECT f.cnpj_completo, est.cnpj_basico, est.nome_fantasia, est.situacao_cadastral, est.uf
         FROM estabelecimentos_fts f JOIN estabelecimentos est ON est.cnpj_completo = f.cnpj_completo
         WHERE estabelecimentos_fts MATCH ? LIMIT ?`
      )
      .all(query, lim) as {
      cnpj_completo: string;
      cnpj_basico: string;
      nome_fantasia: string;
      situacao_cadastral: string;
      uf: string;
    }[];

    for (const r of porFantasia) {
      if (vistos.has(r.cnpj_basico)) continue;
      vistos.add(r.cnpj_basico);
      const emp = db
        .query("SELECT razao_social, porte_empresa FROM empresas WHERE cnpj_basico = ? LIMIT 1")
        .get(r.cnpj_basico) as { razao_social: string; porte_empresa: string } | undefined;
      resultados.push({
        cnpj_basico: r.cnpj_basico,
        cnpj: r.cnpj_completo,
        razao_social: emp?.razao_social ?? null,
        nome_fantasia: r.nome_fantasia,
        porte: emp ? PORTE_EMPRESA[emp.porte_empresa] ?? emp.porte_empresa : null,
        situacao_cadastral: descricaoSituacao(r.situacao_cadastral),
        uf: r.uf,
      });
      if (resultados.length >= lim) break;
    }
  }

  return resultados;
}

/**
 * Busca socios por nome (FTS5), opcionalmente filtrando pelos 6 digitos
 * visiveis do CPF mascarado. Lista todas as empresas em que aparece.
 */
export function buscarSocioPorNome(
  db: Database,
  termo: string,
  opts?: { cpfVisivel?: string; limite?: number }
): Record<string, unknown>[] {
  const query = ftsQuery(termo);
  if (!query) return [];
  const lim = Math.min(Math.max(opts?.limite ?? 20, 1), 100);
  const cpf = opts?.cpfVisivel ? onlyDigits(opts.cpfVisivel).slice(0, 6) : null;

  const matches = db
    .query(
      `SELECT s.cnpj_basico, s.nome_socio, s.cpf_visivel, s.identificador_socio,
              s.qualificacao_socio, s.data_entrada_sociedade
       FROM socios_fts f JOIN socios s ON s.cnpj_basico = f.cnpj_basico AND s.nome_socio = f.nome_socio
       WHERE socios_fts MATCH ? LIMIT ?`
    )
    .all(query, lim * 4) as {
    cnpj_basico: string;
    nome_socio: string;
    cpf_visivel: string;
    identificador_socio: string;
    qualificacao_socio: string;
    data_entrada_sociedade: string | null;
  }[];

  const resultados: Record<string, unknown>[] = [];

  for (const s of matches) {
    if (cpf && s.cpf_visivel !== cpf) continue;
    const emp = db
      .query("SELECT razao_social FROM empresas WHERE cnpj_basico = ? LIMIT 1")
      .get(s.cnpj_basico) as { razao_social: string } | undefined;
    resultados.push({
      nome_socio: s.nome_socio,
      cpf_visivel: s.cpf_visivel || null,
      tipo: IDENTIFICADOR_SOCIO[s.identificador_socio] ?? s.identificador_socio,
      cnpj_basico: s.cnpj_basico,
      razao_social: emp?.razao_social ?? null,
      qualificacao: descricaoDominio(db, "qualificacoes", s.qualificacao_socio),
      data_entrada_sociedade: s.data_entrada_sociedade,
    });
    if (resultados.length >= lim) break;
  }

  return resultados;
}

/**
 * Socios em comum entre dois ou mais CNPJs (basico ou completo). Detecta
 * conluio/laranjas em licitacoes.
 */
export function sociosEmComum(
  db: Database,
  cnpjs: string[]
): Record<string, unknown>[] {
  const basicos = Array.from(
    new Set(
      cnpjs
        .map((c) => onlyDigits(c))
        .filter(Boolean)
        .map((c) => c.slice(0, 8))
    )
  );
  if (basicos.length < 2) return [];

  const placeholders = basicos.map(() => "?").join(", ");
  const rows = db
    .query(
      `SELECT nome_socio, cpf_visivel, identificador_socio,
              GROUP_CONCAT(DISTINCT cnpj_basico) AS basicos,
              COUNT(DISTINCT cnpj_basico) AS qtd
       FROM socios
       WHERE cnpj_basico IN (${placeholders})
       GROUP BY nome_socio_norm, cpf_visivel
       HAVING qtd >= 2
       ORDER BY qtd DESC, nome_socio ASC`
    )
    .all(...basicos) as {
    nome_socio: string;
    cpf_visivel: string;
    identificador_socio: string;
    basicos: string;
    qtd: number;
  }[];

  return rows.map((r) => ({
    nome_socio: r.nome_socio,
    cpf_visivel: r.cpf_visivel || null,
    tipo: IDENTIFICADOR_SOCIO[r.identificador_socio] ?? r.identificador_socio,
    cnpjs_basicos: r.basicos.split(","),
    quantidade_empresas: r.qtd,
  }));
}

export type FiltroEmpresas = {
  cnae?: string;
  uf?: string;
  municipio?: string;
  porte?: string;
  situacao?: string;
  limite?: number;
};

/**
 * Filtra estabelecimentos por CNAE (principal ou secundario), UF,
 * municipio (codigo RFB), porte e situacao cadastral.
 */
export function filtrarEmpresas(
  db: Database,
  filtro: FiltroEmpresas
): Record<string, unknown>[] {
  const lim = Math.min(Math.max(filtro.limite ?? 20, 1), 200);
  const where: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (filtro.cnae) {
    const cnae = onlyDigits(filtro.cnae);
    where.push("(est.cnae_fiscal_principal = ? OR ',' || est.cnae_fiscal_secundaria || ',' LIKE ?)");
    params.push(cnae, `%,${cnae},%`);
  }
  if (filtro.uf) {
    where.push("est.uf = ?");
    params.push(filtro.uf.toUpperCase());
  }
  if (filtro.municipio) {
    where.push("est.municipio = ?");
    params.push(onlyDigits(filtro.municipio));
  }
  if (filtro.situacao) {
    const codigo = situacaoCodigo(filtro.situacao);
    if (codigo) {
      where.push("est.situacao_cadastral IN (?, ?)");
      params.push(codigo, codigo.padStart(2, "0"));
    }
  }

  let porteJoin = "";
  if (filtro.porte) {
    const codigo = porteCodigo(filtro.porte);
    if (codigo) {
      porteJoin = "JOIN empresas emp ON emp.cnpj_basico = est.cnpj_basico";
      where.push("emp.porte_empresa = ?");
      params.push(codigo);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT est.cnpj_completo, est.cnpj_basico, est.nome_fantasia,
              est.situacao_cadastral, est.cnae_fiscal_principal, est.uf, est.municipio
       FROM estabelecimentos est ${porteJoin} ${whereSql} LIMIT ?`
    )
    .all(...params, lim) as {
    cnpj_completo: string;
    cnpj_basico: string;
    nome_fantasia: string;
    situacao_cadastral: string;
    cnae_fiscal_principal: string;
    uf: string;
    municipio: string;
  }[];

  return rows.map((r) => {
    const emp = db
      .query("SELECT razao_social, porte_empresa FROM empresas WHERE cnpj_basico = ? LIMIT 1")
      .get(r.cnpj_basico) as { razao_social: string; porte_empresa: string } | undefined;
    return {
      cnpj: r.cnpj_completo,
      razao_social: emp?.razao_social ?? null,
      nome_fantasia: r.nome_fantasia || null,
      situacao_cadastral: descricaoSituacao(r.situacao_cadastral),
      cnae_principal: r.cnae_fiscal_principal,
      porte: emp ? PORTE_EMPRESA[emp.porte_empresa] ?? emp.porte_empresa : null,
      uf: r.uf,
      municipio_codigo_rfb: r.municipio,
      municipio: descricaoDominio(db, "municipios", r.municipio),
    };
  });
}

function situacaoCodigo(s: string): string | null {
  const direto = onlyDigits(s);
  if (direto) return direto;
  const n = normalize(s);
  const mapa: Record<string, string> = {
    nula: "1",
    ativa: "2",
    suspensa: "3",
    inapta: "4",
    baixada: "8",
  };
  return mapa[n] ?? null;
}

function porteCodigo(s: string): string | null {
  const direto = onlyDigits(s);
  if (direto) return direto.padStart(2, "0");
  const n = normalize(s);
  const mapa: Record<string, string> = {
    me: "01",
    micro: "01",
    microempresa: "01",
    "micro empresa": "01",
    epp: "03",
    "empresa de pequeno porte": "03",
    "pequeno porte": "03",
    demais: "05",
  };
  return mapa[n] ?? null;
}
