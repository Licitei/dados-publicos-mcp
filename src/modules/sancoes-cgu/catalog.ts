/**
 * Metadados e URLs das 5 listas de sancoes da CGU / Portal da Transparencia.
 *
 * Os arquivos sao snapshots COMPLETOS diarios servidos pelo CDN
 * https://dadosabertos-download.cgu.gov.br por DATA (YYYYMMDD). Nao ha link
 * "latest": o indexador comeca em D-1 e regride ate achar HTTP 200 (403 =
 * arquivo inexistente naquela data). Encoding ISO-8859-1, delimitador ';',
 * campos entre aspas duplas, quebras CRLF.
 *
 * Fonte keyless verificada: o CDN responde 200 sem User-Agent, sem cookie e
 * sem header de autenticacao (diferente da api-de-dados, que exige chave).
 */

export const DOMINIO = "sancoes-cgu";
export const DB_FILE = "sancoes-cgu.db";

export const TITULO =
  "Sancoes CGU / Portal da Transparencia (CEIS, CNEP, CEAF, CEPIM, Acordos de Leniencia)";

export const CDN_BASE =
  "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida";

/** Encoding dos CSVs da CGU (Latin-1). NAO e UTF-8. */
export const ENCODING = "iso-8859-1";

export type DatasetKey =
  | "ceis"
  | "cnep"
  | "ceaf"
  | "cepim"
  | "acordos-leniencia";

export type DatasetSpec = {
  /** Slug usado no caminho do CDN (.../saida/<slug>/...). */
  key: DatasetKey;
  /** Sufixo do nome do zip: {YYYYMMDD}_<zipSuffix>.zip */
  zipSuffix: string;
  label: string;
};

/**
 * Datasets na ordem de indexacao. O nome do CSV interno varia:
 * - CEAF usa {YYYYMMDD}_Expulsoes.csv (nao _CEAF.csv)
 * - Acordos usa DOIS CSVs: {YYYYMMDD}_Acordos.csv + {YYYYMMDD}_Efeitos.csv
 * O parser localiza o CSV pelo nome (ver indexer), nao por posicao.
 */
export const DATASETS: DatasetSpec[] = [
  {
    key: "ceis",
    zipSuffix: "CEIS",
    label: "CEIS - Empresas Inidoneas e Suspensas",
  },
  {
    key: "cnep",
    zipSuffix: "CNEP",
    label: "CNEP - Empresas Punidas (Lei 12.846)",
  },
  {
    key: "ceaf",
    zipSuffix: "CEAF",
    label: "CEAF - Expulsoes da Administracao Federal",
  },
  {
    key: "cepim",
    zipSuffix: "CEPIM",
    label: "CEPIM - Entidades Privadas Impedidas",
  },
  {
    key: "acordos-leniencia",
    zipSuffix: "AcordosLeniencia",
    label: "Acordos de Leniencia (Lei 12.846)",
  },
];

/** Monta a URL do zip de um dataset para uma data YYYYMMDD. */
export function zipUrl(dataset: DatasetSpec, yyyymmdd: string): string {
  return `${CDN_BASE}/${dataset.key}/${yyyymmdd}_${dataset.zipSuffix}.zip`;
}
