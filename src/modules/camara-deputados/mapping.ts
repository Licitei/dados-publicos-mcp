/**
 * Funcoes PURAS de parsing/mapeamento dos arquivos da Camara para linhas
 * tipadas. Nao tocam rede nem disco: recebem bytes/strings de CSV e devolvem
 * registros prontos para insercao. Testaveis com fixtures pequenas inline.
 */
import { onlyDigits } from "../../core/normalize";
import { normalize } from "../../core/normalize";
import { parseDataBr } from "../../core/parse/data-br";
import { parseNumeroBr } from "../../core/parse/numero-br";
import { parseCsvObjects } from "../../core/parse/csv";
import { CSV_DELIMITER, CSV_ENCODING } from "./catalog";

export type DeputadoRow = {
  id: number;
  uri: string;
  nome: string;
  nomeCivil: string;
  nomeNorm: string;
  siglaSexo: string;
  dataNascimento: string | null;
  dataFalecimento: string | null;
  ufNascimento: string;
  municipioNascimento: string;
  idLegislaturaInicial: number | null;
  idLegislaturaFinal: number | null;
};

export type DespesaRow = {
  nuDeputadoId: number | null;
  ideCadastro: number | null;
  nomeParlamentar: string;
  cpfDeputado: string;
  sgUF: string;
  sgPartido: string;
  numSubCota: number | null;
  txtDescricao: string;
  txtFornecedor: string;
  cnpjCpf: string;
  cnpjCpfNorm: string;
  datEmissao: string | null;
  vlrDocumento: number | null;
  vlrGlosa: number | null;
  vlrLiquido: number | null;
  numMes: number | null;
  numAno: number | null;
  ideDocumento: string;
  urlDocumento: string;
};

export type ProposicaoRow = {
  id: number;
  uri: string;
  siglaTipo: string;
  numero: number | null;
  ano: number | null;
  ementa: string;
  ementaDetalhada: string;
  keywords: string;
  dataApresentacao: string | null;
  situacao: string;
  ultimoStatusData: string;
  ultimoStatusOrgao: string;
};

export type ProposicaoAutorRow = {
  idProposicao: number | null;
  idDeputadoAutor: number | null;
  uriAutor: string;
  nomeAutor: string;
  nomeAutorNorm: string;
  proponente: number | null;
};

const csvOpts = { delimiter: CSV_DELIMITER, encoding: CSV_ENCODING };

/** Le um campo do record tolerando variacao de caixa nas chaves. */
function field(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== "") return value;
  }

  return "";
}

function toInt(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d-]/g, "");

  if (!digits || digits === "-") return null;

  const n = Number.parseInt(digits, 10);

  return Number.isFinite(n) ? n : null;
}

/**
 * Extrai o id numerico do final de uma uri de deputado/proposicao.
 * Ex: "https://.../deputados/220593" -> 220593.
 */
export function idFromUri(uri: string | undefined | null): number | null {
  if (!uri) return null;

  const match = String(uri).match(/(\d+)\s*$/);

  return match ? Number.parseInt(match[1], 10) : null;
}

/** Mapeia um record de deputados.csv para DeputadoRow (id vem da uri). */
export function mapDeputado(
  record: Record<string, string>,
): DeputadoRow | null {
  const uri = field(record, "uri");
  const id = idFromUri(uri) ?? toInt(field(record, "id"));

  if (id === null) return null;

  const nome = field(record, "nome");
  const nomeCivil = field(record, "nomeCivil");

  return {
    id,
    uri,
    nome,
    nomeCivil,
    nomeNorm: normalize(`${nome} ${nomeCivil}`),
    siglaSexo: field(record, "siglaSexo"),
    dataNascimento: parseDataBr(field(record, "dataNascimento")),
    dataFalecimento: parseDataBr(field(record, "dataFalecimento")),
    ufNascimento: field(record, "ufNascimento"),
    municipioNascimento: field(record, "municipioNascimento"),
    idLegislaturaInicial: toInt(field(record, "idLegislaturaInicial")),
    idLegislaturaFinal: toInt(field(record, "idLegislaturaFinal")),
  };
}

/**
 * Mapeia um record de Ano-{ano}.csv (CEAP) para DespesaRow.
 * Normaliza txtCNPJCPF removendo nao-digitos (vem com pontuacao inconsistente).
 */
export function mapDespesa(record: Record<string, string>): DespesaRow {
  const cnpjCpf = field(record, "txtCNPJCPF");

  return {
    nuDeputadoId: toInt(field(record, "nuDeputadoId")),
    ideCadastro: toInt(field(record, "ideCadastro")),
    nomeParlamentar: field(record, "txNomeParlamentar"),
    cpfDeputado: field(record, "cpf"),
    sgUF: field(record, "sgUF"),
    sgPartido: field(record, "sgPartido"),
    numSubCota: toInt(field(record, "numSubCota")),
    txtDescricao: field(record, "txtDescricao"),
    txtFornecedor: field(record, "txtFornecedor"),
    cnpjCpf,
    cnpjCpfNorm: onlyDigits(cnpjCpf),
    datEmissao: parseDataBr(field(record, "datEmissao")),
    vlrDocumento: parseNumeroBr(field(record, "vlrDocumento")),
    vlrGlosa: parseNumeroBr(field(record, "vlrGlosa")),
    vlrLiquido: parseNumeroBr(field(record, "vlrLiquido")),
    numMes: toInt(field(record, "numMes")),
    numAno: toInt(field(record, "numAno")),
    ideDocumento: field(record, "ideDocumento"),
    urlDocumento: field(record, "urlDocumento"),
  };
}

/** Mapeia um record de proposicoes-{ano}.csv para ProposicaoRow. */
export function mapProposicao(
  record: Record<string, string>,
): ProposicaoRow | null {
  const id = toInt(field(record, "id")) ?? idFromUri(field(record, "uri"));

  if (id === null) return null;

  return {
    id,
    uri: field(record, "uri"),
    siglaTipo: field(record, "siglaTipo"),
    numero: toInt(field(record, "numero")),
    ano: toInt(field(record, "ano")),
    ementa: field(record, "ementa"),
    ementaDetalhada: field(record, "ementaDetalhada"),
    keywords: field(record, "keywords"),
    dataApresentacao: parseDataBr(field(record, "dataApresentacao")),
    situacao: field(record, "ultimoStatus_descricaoSituacao"),
    ultimoStatusData: field(record, "ultimoStatus_dataHora"),
    ultimoStatusOrgao: field(record, "ultimoStatus_siglaOrgao"),
  };
}

/** Mapeia um record de proposicoesAutores-{ano}.csv para ProposicaoAutorRow. */
export function mapProposicaoAutor(
  record: Record<string, string>,
): ProposicaoAutorRow {
  const nomeAutor = field(record, "nomeAutor");

  return {
    idProposicao: toInt(field(record, "idProposicao")),
    idDeputadoAutor:
      toInt(field(record, "idDeputadoAutor")) ??
      idFromUri(field(record, "uriAutor")),
    uriAutor: field(record, "uriAutor"),
    nomeAutor,
    nomeAutorNorm: normalize(nomeAutor),
    proponente: toInt(field(record, "proponente")),
  };
}

/** Faz o parse de bytes/string de deputados.csv -> DeputadoRow[]. */
export function parseDeputados(
  bytes: Uint8Array | ArrayBuffer | string,
): DeputadoRow[] {
  return parseCsvObjects(bytes, undefined, csvOpts)
    .map(mapDeputado)
    .filter((row): row is DeputadoRow => row !== null);
}

/** Faz o parse de bytes/string de Ano-{ano}.csv (CEAP) -> DespesaRow[]. */
export function parseDespesas(
  bytes: Uint8Array | ArrayBuffer | string,
): DespesaRow[] {
  return parseCsvObjects(bytes, undefined, csvOpts).map(mapDespesa);
}

/** Faz o parse de bytes/string de proposicoes-{ano}.csv -> ProposicaoRow[]. */
export function parseProposicoes(
  bytes: Uint8Array | ArrayBuffer | string,
): ProposicaoRow[] {
  return parseCsvObjects(bytes, undefined, csvOpts)
    .map(mapProposicao)
    .filter((row): row is ProposicaoRow => row !== null);
}

/** Faz o parse de bytes/string de proposicoesAutores-{ano}.csv. */
export function parseProposicoesAutores(
  bytes: Uint8Array | ArrayBuffer | string,
): ProposicaoAutorRow[] {
  return parseCsvObjects(bytes, undefined, csvOpts).map(mapProposicaoAutor);
}
