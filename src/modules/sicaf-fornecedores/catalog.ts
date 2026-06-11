/**
 * Metadados e URLs da fonte SICAF / Compras.gov.br - Cadastro de Fornecedores.
 *
 * Fonte: API oficial de Dados Abertos do Compras.gov.br (SIASG / SEGES / MGI).
 * Endpoint /modulo-fornecedor/1_consultarFornecedor e PUBLICO (keyless,
 * verificado por curl: HTTP 200 sem header Authorization).
 *
 * A API oficial so filtra por cnpj/cpf/codigoCnae/naturezaJuridicaId/
 * porteEmpresaId/ativo. NAO ha filtro por nome, UF nem municipio — o valor do
 * indice local e justamente permitir busca por razao social (FTS) e por
 * UF/municipio/CNAE offline.
 */

export const DOMINIO = "sicaf-fornecedores";

export const KEY = "sicaf-fornecedores";

export const TITULO =
  "SICAF / Compras.gov.br - Cadastro de Fornecedores";

export const DB_FILE = "sicaf-fornecedores.db";

/** Endpoint base de consulta de fornecedores (paginado, JSON). */
export const FORNECEDOR_ENDPOINT =
  "https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor";

/** tamanhoPagina deve ficar no intervalo [10, 500]; fora disso => HTTP 400. */
export const TAMANHO_PAGINA_MAX = 500;
export const TAMANHO_PAGINA_MIN = 10;

/**
 * O parametro `ativo` e OBRIGATORIO; sem ele a API retorna 404. Para cobertura
 * total e preciso varrer ativo=true E ativo=false separadamente.
 */
export const ATIVO_VALUES = [true, false] as const;

/**
 * Monta a URL de uma pagina da varredura.
 */
export function buildPageUrl(opts: {
  pagina: number;
  tamanhoPagina?: number;
  ativo: boolean;
}): string {
  const tamanho = Math.min(
    Math.max(opts.tamanhoPagina ?? TAMANHO_PAGINA_MAX, TAMANHO_PAGINA_MIN),
    TAMANHO_PAGINA_MAX
  );
  const params = new URLSearchParams({
    pagina: String(opts.pagina),
    tamanhoPagina: String(tamanho),
    ativo: String(opts.ativo),
  });

  return `${FORNECEDOR_ENDPOINT}?${params.toString()}`;
}
