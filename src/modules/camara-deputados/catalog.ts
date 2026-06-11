/**
 * Metadados e URLs verificadas da fonte Camara dos Deputados - Dados Abertos.
 *
 * Todas as URLs abaixo foram confirmadas por curl (HTTP 200, sem header de
 * autenticacao). Os arquivos CSV usam separador ';', campos entre aspas e BOM
 * UTF-8 (ao contrario de RFB/CGU/TSE que sao ISO-8859-1).
 */

export const DOMINIO = "camara-deputados";
export const DB_FILE = "camara-deputados.db";
export const TITULO =
  "Camara dos Deputados - Dados Abertos (deputados, despesas/CEAP, proposicoes)";

/** Encoding dos arquivos CSV da Camara: UTF-8 (com BOM). */
export const CSV_ENCODING = "utf-8";
/** Separador de campos dos CSV da Camara. */
export const CSV_DELIMITER = ";";

/** Primeiro e ultimo ano com cobertura de CEAP (verificado 2008 e 2026). */
export const CEAP_ANO_MIN = 2008;
export const CEAP_ANO_MAX = 2026;

/** URL da lista historica completa de deputados (CSV). */
export const DEPUTADOS_URL =
  "https://dadosabertos.camara.leg.br/arquivos/deputados/csv/deputados.csv";

/** URL do ZIP de despesas (CEAP) de um ano. */
export function ceapUrl(ano: number): string {
  return `https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;
}

/** URL do CSV de proposicoes de um ano. */
export function proposicoesUrl(ano: number): string {
  return `https://dadosabertos.camara.leg.br/arquivos/proposicoes/csv/proposicoes-${ano}.csv`;
}

/** URL do CSV de autores de proposicoes de um ano. */
export function proposicoesAutoresUrl(ano: number): string {
  return `https://dadosabertos.camara.leg.br/arquivos/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`;
}

/**
 * Anos default a indexar quando o escopo nao informa anos.
 *
 * DEFAULT-2026: sem flags de escopo (--anos/--anoInicial/--anoFinal), o build()
 * indexa SOMENTE o ano corrente. O ano corrente e resolvido dinamicamente em
 * runtime (new Date().getFullYear()), saturado em CEAP_ANO_MAX. As flags
 * --anos/--anoInicial/--anoFinal continuam sobrepondo este default.
 */
export function defaultAnos(): number[] {
  const anoCorrente = new Date().getFullYear();
  const fim = Math.min(anoCorrente, CEAP_ANO_MAX);

  return [fim];
}

/** Gera o intervalo de anos [min, max] (inclusivo), saturando nos limites CEAP. */
export function anosNoIntervalo(min: number, max: number): number[] {
  const lo = Math.max(CEAP_ANO_MIN, Math.min(min, max));
  const hi = Math.min(CEAP_ANO_MAX, Math.max(min, max));
  const anos: number[] = [];

  for (let ano = lo; ano <= hi; ano++) anos.push(ano);

  return anos;
}
