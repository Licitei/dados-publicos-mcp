/**
 * Metadados e URLs do indice offline do PNCP (key "pncp-bulk").
 *
 * NAO existe um bulk dump consolidado publicado pelo PNCP: a fonte e a mesma
 * API PAGINADA de Consulta v1 que o modulo dados-publicos ja consome online
 * (client.ts -> PNCP_CONSULTA_BASE_URL). O indice offline e um harvest dessa
 * API gravado em SQLite + FTS5 para habilitar busca full-text em toda a base,
 * busca de fornecedor por NOME e agregacao de gasto - coisas que a API online
 * nao suporta (so filtra por data + modalidade + UF + CNPJ exato).
 *
 * Este modulo coexiste com o modo online; nada aqui edita arquivos existentes.
 */

/** Chave da fonte na sintese verificada. */
export const PNCP_BULK_KEY = "pncp-bulk";

/** Titulo exibido em status/registry. */
export const PNCP_BULK_TITULO =
  "PNCP - Portal Nacional de Contratacoes Publicas (indice offline)";

/** Dominio de armazenamento (coexiste com o modulo online). */
export const PNCP_DOMINIO = "dados-publicos";

/** Arquivo SQLite do indice offline: getDataDir()/dados-publicos/pncp.db */
export const PNCP_DB_FILE = "pncp.db";

/** Base da API de Consulta v1 - a MESMA usada pelo modo online. */
export const PNCP_CONSULTA_BASE_URL = "https://pncp.gov.br/api/consulta/v1";

/**
 * Endpoints harvestaveis da API de Consulta v1 (todos verificados HTTP 200).
 * - contratacoes/publicacao: EXIGE codigoModalidadeContratacao (loop 1..14).
 * - contratos: enumeravel so por janela de data.
 * - atas: enumeravel so por janela de data; shape FLAT (diferente das demais).
 */
export const PNCP_ENDPOINTS = {
  contratacoes: "contratacoes/publicacao",
  contratos: "contratos",
  atas: "atas",
} as const;

/**
 * Modalidades de contratacao (codigoModalidadeContratacao) para cobrir editais.
 * contratacoes/publicacao EXIGE este parametro; cobertura total => loop 1..14.
 */
export const MODALIDADES_CONTRATACAO = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;

/** Limites de tamanhoPagina verificados (HTTP 400 fora deste intervalo). */
export const PAGE_SIZE_MIN = 10;
export const PAGE_SIZE_MAX = 50;

/** Nomes das tabelas do indice. */
export const TABELAS = {
  contratacao: "contratacao",
  contrato: "contrato",
  ata: "ata",
} as const;

export const FTS_TABELAS = {
  contratacao: "contratacao_fts",
  contrato: "contrato_fts",
  ata: "ata_fts",
} as const;

/** Tabela de metadados de sincronizacao (uma linha). */
export const META_TABELA = "pncp_meta";
