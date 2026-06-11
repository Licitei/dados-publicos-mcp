/**
 * Metadados e URLs da fonte CNAE 2.0 (IBGE / CONCLA).
 *
 * Fonte verificada (2026-06-11): API v2 do IBGE, sem autenticacao, somente GET.
 * O endpoint /subclasses ja embute toda a hierarquia
 * (subclasse > classe > grupo > divisao > secao), entao indexar somente ele
 * reconstroi a arvore CNAE 2.0 inteira (1332 subclasses).
 *
 * Caveats relevantes (ver briefing):
 * - Codigos vem SEM mascara de pontuacao (ex subclasse "4929902", classe
 *   "01113" com zero a esquerda). Trate id como STRING, nunca number.
 * - observacoes[] contem "\r\n" embutidos (texto multilinha) -> limpar.
 * - Acentuacao legada em algumas descricoes -> normalizar para busca.
 */

export const CNAE_KEY = "cnae";

export const CNAE_TITULO =
  "Tabela CNAE 2.0 (secoes, divisoes, grupos, classes, subclasses) - IBGE";

export const CNAE_DOMINIO = "cnae";

export const CNAE_INDEX_FILE = "index.json";

/**
 * Base da API v2 de CNAE do IBGE. So aceita GET (HEAD retorna 405).
 */
export const CNAE_API_BASE = "https://servicodados.ibge.gov.br/api/v2/cnae";

/**
 * Endpoint recomendado para indexacao: traz as 1332 subclasses com a
 * hierarquia completa aninhada. Sozinho cobre 100% da arvore CNAE.
 */
export const CNAE_SUBCLASSES_URL = `${CNAE_API_BASE}/subclasses`;

export type CnaeNivel = "secao" | "divisao" | "grupo" | "classe" | "subclasse";

/**
 * Tamanho (em digitos) do id de cada nivel hierarquico, ja sem mascara.
 * A secao usa letra (A-U), portanto nao tem tamanho fixo de digitos.
 */
export const CNAE_NIVEL_TAMANHO: Record<Exclude<CnaeNivel, "secao">, number> = {
  divisao: 2,
  grupo: 3,
  classe: 5,
  subclasse: 7,
};
