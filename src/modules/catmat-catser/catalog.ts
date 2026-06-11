/**
 * Metadados e URLs da fonte CATMAT/CATSER (Compras.gov.br Dados Abertos).
 *
 * Fonte: Ministerio da Gestao e da Inovacao (MGI) / SEGES - Compras.gov.br (SIASG).
 * Licenca: ODbL (atribuir Compras.gov.br/SIASG).
 *
 * Endpoints publicos (keyless, GET; HEAD retorna 404 no Azure Front Door).
 * Paginacao: pagina (>=1) + tamanhoPagina obrigatoriamente entre 10 e 500.
 * Resposta: { resultado[], totalRegistros, totalPaginas, paginasRestantes }.
 *
 * IMPORTANTE: o filtro textual da API (descricaoItem) retorna 0 mesmo para
 * termos existentes -> busca por nome so funciona via indice local (FTS5).
 */

export const KEY = "catmat-catser";
export const DOMINIO = "catmat-catser";
export const DB_FILE = "catmat-catser.db";
export const TITULO =
  "Catalogo de Materiais (CATMAT) e Servicos (CATSER) - Compras.gov.br";

const BASE = "https://dadosabertos.compras.gov.br";

/** Tamanho de pagina maximo aceito pela API (10..500). */
export const PAGE_SIZE = 500;

export const ENDPOINTS = {
  /** CATMAT - Itens de Material (nucleo, ~342.507 itens). */
  catmatItem: `${BASE}/modulo-material/4_consultarItemMaterial`,
  /** CATSER - Itens de Servico (nucleo, ~3.089 itens). */
  catserItem: `${BASE}/modulo-servico/6_consultarItemServico`,
  /** CATMAT - Grupos (nivel 1, ~79). */
  catmatGrupo: `${BASE}/modulo-material/1_consultarGrupoMaterial`,
  /** CATMAT - Classes (nivel 2, ~696). */
  catmatClasse: `${BASE}/modulo-material/2_consultarClasseMaterial`,
  /** CATMAT - PDM Padrao Descricao Material (nivel 3, ~20.399). */
  catmatPdm: `${BASE}/modulo-material/3_consultarPdmMaterial`,
} as const;

/** Monta a URL paginada de um endpoint. */
export function pageUrl(
  endpoint: string,
  pagina: number,
  tamanhoPagina: number = PAGE_SIZE,
): string {
  return `${endpoint}?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
}
