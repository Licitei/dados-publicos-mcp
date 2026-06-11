/**
 * Metadados e URLs da fonte CAPAG (Capacidade de Pagamento de Estados e
 * Municipios — Secretaria do Tesouro Nacional / SICONFI).
 *
 * Verificado (curl 200, sem chave):
 * - CKAN Action API package_show -> descobre o resource mais recente por ano/posicao
 *   (NAO hardcodar URL; o nome do arquivo muda a cada posicao).
 * - CAPAG Estados: CSV (`;`, UTF-8, '%' e virgula decimal), 27 linhas por ano.
 * - CAPAG Municipios: XLSX ~22 MB; aba "CAPAG Ano Base AAAA" (cabecalho linha 4,
 *   dados a partir da linha 5); indicadores como fracao decimal (0.8016 = 80,16%).
 * - SICONFI /entes: ponte cnpj <-> cod_ibge <-> municipio/UF.
 */

export const DOMINIO = "capag";

/** Nome do arquivo SQLite dentro de getDataDir()/capag/ . */
export const DB_FILE = "capag.db";

export const TITULO =
  "CAPAG - Capacidade de Pagamento de Estados e Municipios (Tesouro Nacional)";

/** Base do CKAN do Tesouro Transparente. */
export const CKAN_BASE = "https://www.tesourotransparente.gov.br/ckan";

/** package_show por dataset (descoberta dinamica de resources). */
export const PACKAGE_SHOW = {
  estados: `${CKAN_BASE}/api/3/action/package_show?id=capag-estados`,
  municipios: `${CKAN_BASE}/api/3/action/package_show?id=capag-municipios`,
} as const;

/** SICONFI: catalogo de entes (ponte cnpj<->cod_ibge). ~866 KB, sem chave. */
export const SICONFI_ENTES =
  "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes";

/** Notas CAPAG possiveis (com modificadores e marcadores de indisponibilidade). */
export type NotaCapag = "A+" | "A" | "B+" | "B" | "C" | "D" | "n.d." | "n.e.";

/** Esfera de um ente no SICONFI: U=Uniao, E=Estado, M=Municipio. */
export type Esfera = "U" | "E" | "M";

/**
 * Layout da aba "CAPAG Ano Base AAAA" do XLSX de municipios.
 * Indices de coluna (0-based) confirmados no arquivo de nov/2025:
 * A=0 cod_ibge, B=1 nome, C=2 UF, F=5/G=6 ind1/nota1,
 * AI=34/AK=36 ind2/nota2, BL=63/BO=66 ind3/nota3, BR=69 capag.
 */
export const MUNICIPIOS_XLSX = {
  /** Prefixo do nome da aba util (segue o ano-base). */
  sheetPrefix: "CAPAG Ano Base",
  /** Primeira linha de dados (1-based) — abaixo das 4 linhas de cabecalho. */
  firstDataRow: 5,
  /** Indices de coluna 0-based. */
  col: {
    codIbge: 0, // A
    nome: 1, // B
    uf: 2, // C
    indicador1: 5, // F
    nota1: 6, // G
    indicador2: 34, // AI
    nota2: 36, // AK
    indicador3: 63, // BL
    nota3: 66, // BO
    capag: 69, // BR
  },
} as const;
