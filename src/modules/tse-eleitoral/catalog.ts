import { normalize } from "../../core/normalize";

export { normalize };

/**
 * Catalogo da fonte TSE Dados Abertos Eleitorais.
 *
 * Licenca: Creative Commons Atribuicao (CC-BY) declarada no portal CKAN do TSE.
 * A ATRIBUICAO AO TSE E OBRIGATORIA ao redistribuir dados derivados.
 *
 * Encoding dos CSVs: ISO-8859-1 (Latin-1), separador ';', decimais com virgula
 * ("5000,00"). Cada zip de ano contem o agregado *_BRASIL.csv e tambem 27 CSV
 * por UF com os MESMOS dados - indexamos SOMENTE o *_BRASIL.csv para nao
 * duplicar linhas.
 */

export const KEY = "tse-eleitoral";
export const TITULO =
  "TSE Dados Abertos Eleitorais (candidatos, bens, doacoes, fornecedores)";
export const LICENCA = "CC-BY (atribuicao ao TSE obrigatoria)";

/** Encoding e separador dos CSVs do TSE. */
export const CSV_ENCODING = "iso-8859-1";
export const CSV_DELIMITER = ";";

export const CDN_BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
export const CKAN_BASE = "https://dadosabertos.tse.jus.br/api/3/action";

/**
 * Anos eleitorais conhecidos (referencia historica).
 *
 * NOTA: o default de escopo do build NAO usa mais esta lista. Desde o
 * DEFAULT-2026, sem flags de escopo o build indexa apenas o ano corrente
 * (new Date().getFullYear()), resolvido em runtime no indexer. As flags
 * --anos/--mes/--ufs continuam sobrepondo o default.
 */
export const DEFAULT_ANOS = [2024, 2022];

export type DatasetTipo =
  | "consulta_cand"
  | "bem_candidato"
  | "prestacao_contas";

/** Monta a URL do zip de um tipo/ano seguindo o padrao verificado da CDN. */
export function zipUrl(tipo: DatasetTipo, ano: number): string {
  if (tipo === "prestacao_contas") {
    return `${CDN_BASE}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`;
  }

  return `${CDN_BASE}/${tipo}/${tipo}_${ano}.zip`;
}

/** id CKAN para descoberta programatica das URLs (package_show). */
export function ckanPackageId(tipo: DatasetTipo, ano: number): string {
  if (tipo === "prestacao_contas") {
    return `prestacao-de-contas-eleitorais-${ano}`;
  }

  return `candidatos-${ano}`;
}

export function ckanPackageShowUrl(tipo: DatasetTipo, ano: number): string {
  return `${CKAN_BASE}/package_show?id=${ckanPackageId(tipo, ano)}`;
}

/**
 * Identifica a tabela logica de um nome de arquivo dentro do zip de prestacao
 * de contas. Retorna null para arquivos que nao indexamos (por UF, leiame etc).
 */
export type TabelaPrestacao =
  | "receitas"
  | "receitas_doador_originario"
  | "despesas_contratadas";

/** Sufixo BRASIL que identifica o agregado nacional (vs por UF). */
const BRASIL_RE = /_BRASIL\.csv$/i;

export function isBrasilCsv(name: string): boolean {
  return BRASIL_RE.test(name);
}

/**
 * Classifica um arquivo *_BRASIL.csv do zip de prestacao de contas em uma das
 * tabelas indexadas. despesas_pagas e ignorada (nao tem CPF/CNPJ de fornecedor).
 */
export function classifyPrestacao(name: string): TabelaPrestacao | null {
  if (!isBrasilCsv(name)) return null;

  const lower = name.toLowerCase();

  // Ordem importa: doador_originario contem "receitas".
  if (lower.includes("receitas_candidatos_doador_originario")) {
    return "receitas_doador_originario";
  }
  if (lower.includes("receitas_candidatos")) return "receitas";
  if (lower.includes("despesas_contratadas")) return "despesas_contratadas";

  return null;
}
