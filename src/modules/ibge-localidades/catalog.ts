/**
 * Metadados e URLs da fonte IBGE Localidades.
 *
 * Fonte: IBGE - servicodados.ibge.gov.br/api/docs (API publica, sem chave).
 * A API SO aceita GET (HEAD/POST retornam HTTP 405, Allow: GET); CORS aberto.
 * Tabela de referencia pequena e estavel: reindexar ~1x por ano e suficiente.
 */

export const dominio = "ibge-localidades";

export const titulo =
  "IBGE Localidades (UFs, mesorregioes e municipios com codigo IBGE)";

/**
 * Endpoint do dump completo de municipios. Cada item traz o `id` (codigo IBGE
 * de 7 digitos exigido pelo filtro codigoMunicipioIbge do PNCP), `nome` e a
 * hierarquia aninhada. Sozinho e suficiente para construir todo o indice.
 *
 * CAVEAT: 1 dos 5571 municipios (id 5101837) tem microrregiao=null; nesse caso
 * a UF/regiao saem do path alternativo regiao-imediata.regiao-intermediaria.UF
 * e a mesorregiao fica null (sem crashar).
 */
export const municipiosUrl =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
