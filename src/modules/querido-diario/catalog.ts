/**
 * Metadados e construcao de URLs da fonte Querido Diario (OKBR).
 *
 * Os diarios oficiais municipais sao publicados como ZIPs agregados por UF/ano
 * em data.queridodiario.ok.org.br/aggregates/{UF}/{UF}_{ANO}.zip; cada ZIP
 * contem 1 XML por municipio (root>meta + root>diarios>diario[]) com o texto
 * OCR/extraido de cada diario no campo <conteudo>.
 *
 * ATENCAO (caveat verificado): o campo file_path retornado pela API
 * /aggregates/{UF} vem com bug (falta a barra: "data.queridodiario.ok.org.braggregates/...").
 * NUNCA use file_path diretamente — reconstrua a URL com buildAggregateZipUrl.
 */

export const key = "querido-diario";
export const titulo =
  "Querido Diario - Diarios Oficiais Municipais (Open Knowledge Brasil)";
export const licenca = "CC-BY 4.0 (dados) + MIT (codigo)";

export const API_BASE = "https://api.queridodiario.ok.org.br";
export const DATA_BASE = "https://data.queridodiario.ok.org.br";

/**
 * 26 UFs com dados no Querido Diario. AC (Acre) retorna 404 (sem dados) e por
 * isso e omitido. Usado como escopo padrao quando o usuario nao filtra por UF.
 */
export const UFS_COM_DADOS = [
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type Uf = (typeof UFS_COM_DADOS)[number];

/** UF (qualquer dos 27 estados + DF) reconhecida como valida em entrada. */
export const UFS_VALIDAS = [...UFS_COM_DADOS, "AC"] as const;

/**
 * Reconstroi a URL real do ZIP agregado por UF e ano.
 * Padrao verificado (HTTP 206 com Range): {DATA_BASE}/aggregates/{UF}/{UF}_{ANO}.zip
 */
export function buildAggregateZipUrl(uf: string, ano: number): string {
  return `${DATA_BASE}/aggregates/${uf.toUpperCase()}/${uf.toUpperCase()}_${ano}.zip`;
}

/** URL da API que lista os ZIPs disponiveis de uma UF (com hash md5 e tamanho). */
export function buildAggregatesApiUrl(uf: string): string {
  return `${API_BASE}/aggregates/${uf.toUpperCase()}`;
}

/**
 * Resposta da API /aggregates/{UF}.
 * file_path vem com bug (sem barra) — sempre reconstruir a URL via buildAggregateZipUrl.
 */
export type AggregateInfo = {
  territory_id: string;
  state_code: string;
  file_path: string;
  year: number;
  last_updated: string;
  hash_info: string;
  file_size_mb: number;
};

export type AggregatesResponse = {
  aggregates: AggregateInfo[];
};
