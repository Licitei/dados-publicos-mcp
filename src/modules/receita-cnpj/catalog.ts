/**
 * Metadados e URLs da fonte "receita-cnpj": Dados Abertos do CNPJ da
 * Receita Federal (base completa de empresas, estabelecimentos, socios e
 * Simples Nacional / MEI).
 *
 * Acesso (verificado) e via Nextcloud public-share / WebDAV. O token do
 * share e usado como usuario em HTTP Basic auth (senha vazia). NAO ha API
 * REST de bulk; os paths antigos (/dados/cnpj/...) retornam 404 desde a
 * mudanca de layout de jan/2026.
 *
 * Encoding dos CSV: ISO-8859-1 (Latin-1). Delimitador ';', campos entre
 * aspas duplas, SEM header. Cada ZIP contem 1 CSV cujo nome interno e do
 * tipo F.K03200$Z.D*CSV -> NAO confiar no nome, identificar pela tabela.
 */

export const RECEITA_CNPJ_KEY = "receita-cnpj";
export const RECEITA_CNPJ_TITULO =
  "Receita Federal - Dados Abertos do CNPJ (empresas, estabelecimentos, socios, Simples)";

/** Encoding dos CSVs da RFB (Latin-1, NAO UTF-8). */
export const RFB_ENCODING = "iso-8859-1";
/** Delimitador dos CSVs. */
export const RFB_DELIMITER = ";";

/**
 * Host base do Nextcloud public-share da RFB. O endpoint WebDAV e o unico
 * verificado funcionando (200/206).
 */
export const RFB_BASE = "https://arquivos.receitafederal.gov.br";

/** Endpoint WebDAV do share publico. */
export const RFB_WEBDAV = `${RFB_BASE}/public.php/webdav/`;

/**
 * Token do share publico, usado como usuario no HTTP Basic auth (senha
 * vazia). E uma credencial obrigatoria (401 sem ela) mas publicada
 * publicamente. Pode mudar se a RFB recriar o share.
 */
export const RFB_SHARE_TOKEN = "YggdBLfdninEJX9";

/** Layout/metadados oficial dos campos (PDF, referencia). */
export const RFB_METADADOS_PDF =
  "https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf";

/**
 * Header Authorization Basic para o share. usuario=token, senha vazia.
 */
export function rfbAuthHeader(token: string = RFB_SHARE_TOKEN): string {
  // btoa("<token>:") -> Basic auth com senha vazia.
  const credentials = `${token}:`;
  return `Basic ${btoa(credentials)}`;
}

/** URL WebDAV de um arquivo dentro de uma pasta mensal YYYY-MM. */
export function webdavFileUrl(mes: string, file: string): string {
  return `${RFB_WEBDAV}${mes}/${file}`;
}

/** Os 6 grupos de tabelas de dominio (2 colunas: codigo;descricao). */
export const DOMINIO_FILES = [
  { tabela: "cnaes", file: "Cnaes.zip" },
  { tabela: "municipios", file: "Municipios.zip" },
  { tabela: "naturezas", file: "Naturezas.zip" },
  { tabela: "paises", file: "Paises.zip" },
  { tabela: "qualificacoes", file: "Qualificacoes.zip" },
  { tabela: "motivos", file: "Motivos.zip" },
] as const;

export type DominioTabela = (typeof DOMINIO_FILES)[number]["tabela"];

/** Nomes dos ZIPs particionados (0..9). */
export function partFiles(
  prefix: "Empresas" | "Estabelecimentos" | "Socios",
): string[] {
  return Array.from({ length: 10 }, (_, i) => `${prefix}${i}.zip`);
}

/** Arquivo unico do Simples Nacional / MEI. */
export const SIMPLES_FILE = "Simples.zip";

/**
 * Colunas POSICIONAIS de cada tabela, na ordem do layout oficial da RFB.
 * (CSV sem header -> mapeamos por posicao.)
 */

/** Empresas: 7 colunas. */
export const EMPRESAS_COLUNAS = [
  "cnpj_basico",
  "razao_social",
  "natureza_juridica",
  "qualificacao_responsavel",
  "capital_social",
  "porte_empresa",
  "ente_federativo_responsavel",
] as const;

/** Estabelecimentos: 30 colunas. */
export const ESTABELECIMENTOS_COLUNAS = [
  "cnpj_basico",
  "cnpj_ordem",
  "cnpj_dv",
  "identificador_matriz_filial",
  "nome_fantasia",
  "situacao_cadastral",
  "data_situacao_cadastral",
  "motivo_situacao_cadastral",
  "nome_cidade_exterior",
  "pais",
  "data_inicio_atividade",
  "cnae_fiscal_principal",
  "cnae_fiscal_secundaria",
  "tipo_logradouro",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "uf",
  "municipio",
  "ddd1",
  "telefone1",
  "ddd2",
  "telefone2",
  "ddd_fax",
  "fax",
  "correio_eletronico",
  "situacao_especial",
  "data_situacao_especial",
] as const;

/** Socios: 11 colunas. */
export const SOCIOS_COLUNAS = [
  "cnpj_basico",
  "identificador_socio",
  "nome_socio",
  "cnpj_cpf_socio",
  "qualificacao_socio",
  "data_entrada_sociedade",
  "pais",
  "representante_legal",
  "nome_representante",
  "qualificacao_representante_legal",
  "faixa_etaria",
] as const;

/** Simples: 7 colunas. */
export const SIMPLES_COLUNAS = [
  "cnpj_basico",
  "opcao_simples",
  "data_opcao_simples",
  "data_exclusao_simples",
  "opcao_mei",
  "data_opcao_mei",
  "data_exclusao_mei",
] as const;

/** Mapa codigo -> descricao da situacao cadastral. */
export const SITUACAO_CADASTRAL: Record<string, string> = {
  "1": "nula",
  "01": "nula",
  "2": "ativa",
  "02": "ativa",
  "3": "suspensa",
  "03": "suspensa",
  "4": "inapta",
  "04": "inapta",
  "8": "baixada",
  "08": "baixada",
};

/** Mapa codigo -> descricao do porte. */
export const PORTE_EMPRESA: Record<string, string> = {
  "00": "nao informado",
  "01": "micro empresa",
  "03": "empresa de pequeno porte",
  "05": "demais",
};

/** Mapa codigo -> descricao de identificador_matriz_filial. */
export const MATRIZ_FILIAL: Record<string, string> = {
  "1": "matriz",
  "2": "filial",
};

/** Mapa codigo -> descricao de identificador_socio. */
export const IDENTIFICADOR_SOCIO: Record<string, string> = {
  "1": "pessoa juridica",
  "2": "pessoa fisica",
  "3": "estrangeiro",
};
