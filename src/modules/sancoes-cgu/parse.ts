/**
 * Parsing e mapeamento dos CSVs da CGU para linhas tipadas.
 *
 * Funcoes PURAS: recebem bytes/string de CSV (ja descompactados) e devolvem
 * arrays de objetos. Nao tocam em rede nem em disco. Isto permite testar com
 * fixtures inline pequenas.
 *
 * As 5 listas (CEIS, CNEP, CEAF, CEPIM, Acordos+Efeitos) sao unificadas numa
 * linha de sancao comum (SancaoRow) sempre que possivel; Acordos vira tambem
 * uma SancaoRow (lista="acordos-leniencia") e mantem uma tabela propria de
 * Efeitos 1:N.
 */
import { onlyDigits } from "../../core/normalize";
import { parseDataBr } from "../../core/parse/data-br";
import { parseCsvObjects } from "../../core/parse/csv";
import { ENCODING, type DatasetKey } from "./catalog";

/** Linha unificada de sancao, uma por registro de qualquer das listas. */
export type SancaoRow = {
  /** Qual lista originou a linha. */
  lista: DatasetKey;
  /** Id da linha conforme a fonte (CODIGO DA SANCAO, ID DO ACORDO, ...). */
  codigo: string | null;
  /** "F" (fisica), "J" (juridica) ou null quando a fonte nao informa. */
  tipoPessoa: string | null;
  /** Documento como veio na fonte (pode estar mascarado: ***.648.337-**). */
  documento: string | null;
  /** Apenas digitos do documento; usado para busca por CNPJ/CPF. Pode ser "". */
  docNormalizado: string;
  /** Nome do sancionado / entidade. */
  nome: string | null;
  /** Razao social cadastro Receita (quando aplicavel). */
  razaoSocial: string | null;
  categoria: string | null;
  numeroProcesso: string | null;
  /** Valor da multa (so CNEP); string crua da fonte. */
  valorMulta: string | null;
  /** Data de inicio da sancao em ISO (YYYY-MM-DD) ou null. */
  dataInicio: string | null;
  /** Data final da sancao em ISO (YYYY-MM-DD) ou null. */
  dataFinal: string | null;
  /** Data de publicacao (CEAF) em ISO ou null. */
  dataPublicacao: string | null;
  orgaoSancionador: string | null;
  ufOrgao: string | null;
  fundamentacao: string | null;
  /** Texto concatenado para indice de busca (nome + razao social, normalizado). */
  buscaTexto: string;
};

/** Efeito de um acordo de leniencia (1:N por id do acordo). */
export type EfeitoRow = {
  idAcordo: string;
  /** Documento (CNPJ) do sancionado do acordo, para casar com SancaoRow. */
  docNormalizado: string;
  efeito: string | null;
  complemento: string | null;
};

const decodeOpts = { encoding: ENCODING, delimiter: ";" } as const;

/**
 * Localiza o valor de uma coluna casando o header de forma tolerante a
 * acentos, caixa e espacos repetidos. Isto sobrevive aos typos da fonte
 * (ex. "SITUACAO DO ACORDO DE LENIENICA", "RAZAO SOCIAL  CADASTRO RECEITA").
 * O primeiro candidato que casar e usado.
 */
function pick(
  record: Record<string, string>,
  candidates: readonly string[],
): string | null {
  const normalizedRecord = normalizeKeys(record);

  for (const candidate of candidates) {
    const key = headerKey(candidate);
    const value = normalizedRecord.get(key);

    if (value !== undefined && value.trim() !== "") return value.trim();
  }

  return null;
}

function normalizeKeys(record: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();

  for (const [rawKey, value] of Object.entries(record)) {
    map.set(headerKey(rawKey), value);
  }

  return map;
}

/** Chave canonica de header: sem acento, minuscula, espacos colapsados. */
export function headerKey(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto de busca: nome + razao social, sem acento e minusculo. */
function buildBuscaTexto(...parts: (string | null)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type RowMapper = (record: Record<string, string>) => SancaoRow;

const COLS = {
  codigo: ["CODIGO DA SANCAO"],
  tipoPessoa: ["TIPO DE PESSOA"],
  documento: ["CPF OU CNPJ DO SANCIONADO"],
  nome: ["NOME DO SANCIONADO"],
  razaoSocial: [
    "RAZAO SOCIAL - CADASTRO RECEITA",
    "RAZAO SOCIAL CADASTRO RECEITA",
  ],
  categoria: ["CATEGORIA DA SANCAO"],
  numeroProcesso: ["NUMERO DO PROCESSO"],
  valorMulta: ["VALOR DA MULTA"],
  dataInicio: ["DATA INICIO SANCAO", "DATA INICIO DA SANCAO"],
  dataFinal: ["DATA FINAL SANCAO", "DATA FINAL DA SANCAO"],
  dataPublicacao: ["DATA PUBLICACAO", "DATA DE PUBLICACAO"],
  orgao: ["ORGAO SANCIONADOR"],
  ufOrgao: ["UF ORGAO SANCIONADOR"],
  fundamentacao: ["FUNDAMENTACAO LEGAL"],
} as const;

/** Mapper compartilhado por CEIS / CNEP (mesmos campos; CNEP tem multa). */
function sancaoMapper(lista: DatasetKey): RowMapper {
  return (record) => {
    const documento = pick(record, COLS.documento);
    const nome = pick(record, COLS.nome);
    const razaoSocial = pick(record, COLS.razaoSocial);

    return {
      lista,
      codigo: pick(record, COLS.codigo),
      tipoPessoa: pick(record, COLS.tipoPessoa),
      documento,
      docNormalizado: documento ? onlyDigits(documento) : "",
      nome,
      razaoSocial,
      categoria: pick(record, COLS.categoria),
      numeroProcesso: pick(record, COLS.numeroProcesso),
      valorMulta: pick(record, COLS.valorMulta),
      dataInicio: parseDataBr(pick(record, COLS.dataInicio)),
      dataFinal: parseDataBr(pick(record, COLS.dataFinal)),
      dataPublicacao: parseDataBr(pick(record, COLS.dataPublicacao)),
      orgaoSancionador: pick(record, COLS.orgao),
      ufOrgao: pick(record, COLS.ufOrgao),
      fundamentacao: pick(record, COLS.fundamentacao),
      buscaTexto: buildBuscaTexto(nome, razaoSocial),
    };
  };
}

/** CEAF (Expulsoes): CPF mascarado; usa CATEGORIA/ORGAO/DATA PUBLICACAO. */
const ceafMapper: RowMapper = (record) => {
  const documento = pick(record, COLS.documento);
  const nome = pick(record, COLS.nome);

  return {
    lista: "ceaf",
    codigo: pick(record, COLS.codigo),
    tipoPessoa: pick(record, COLS.tipoPessoa),
    documento,
    docNormalizado: documento ? onlyDigits(documento) : "",
    nome,
    razaoSocial: null,
    categoria: pick(record, COLS.categoria),
    numeroProcesso: pick(record, COLS.numeroProcesso),
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    dataPublicacao: parseDataBr(pick(record, COLS.dataPublicacao)),
    orgaoSancionador:
      pick(record, COLS.orgao) ?? pick(record, ["ORGAO DE LOTACAO"]),
    ufOrgao: pick(record, COLS.ufOrgao),
    fundamentacao: pick(record, COLS.fundamentacao),
    buscaTexto: buildBuscaTexto(nome, pick(record, ["CARGO EFETIVO"])),
  };
};

/** CEPIM: schema enxuto de 5 colunas (entidade + convenio + motivo). */
const cepimMapper: RowMapper = (record) => {
  const documento = pick(record, [
    "CNPJ ENTIDADE",
    "CPF OU CNPJ DO SANCIONADO",
  ]);
  const nome = pick(record, ["NOME ENTIDADE", "NOME DO SANCIONADO"]);

  return {
    lista: "cepim",
    codigo: pick(record, ["NUMERO CONVENIO", ...COLS.codigo]),
    tipoPessoa: "J",
    documento,
    docNormalizado: documento ? onlyDigits(documento) : "",
    nome,
    razaoSocial: null,
    categoria: pick(record, ["MOTIVO DO IMPEDIMENTO"]),
    numeroProcesso: pick(record, ["NUMERO CONVENIO"]),
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    dataPublicacao: null,
    orgaoSancionador: pick(record, ["ORGAO CONCEDENTE", ...COLS.orgao]),
    ufOrgao: null,
    fundamentacao: pick(record, ["MOTIVO DO IMPEDIMENTO"]),
    buscaTexto: buildBuscaTexto(nome),
  };
};

/** Acordos de Leniencia -> SancaoRow (lista="acordos-leniencia"). */
const acordoMapper: RowMapper = (record) => {
  // CNPJ pode ser placeholder estrangeiro (EX..., nao 14 digitos).
  const documento = pick(record, ["CNPJ DO SANCIONADO", ...COLS.documento]);
  const razaoSocial = pick(record, [
    "RAZAO SOCIAL CADASTRO RECEITA",
    "RAZAO SOCIAL - CADASTRO RECEITA",
  ]);

  return {
    lista: "acordos-leniencia",
    codigo: pick(record, ["ID DO ACORDO"]),
    tipoPessoa: "J",
    documento,
    docNormalizado: documento ? onlyDigits(documento) : "",
    nome: razaoSocial,
    razaoSocial,
    // Typo da fonte: "SITUACAO DO ACORDO DE LENIENICA".
    categoria: pick(record, [
      "SITUACAO DO ACORDO DE LENIENICA",
      "SITUACAO DO ACORDO DE LENIENCIA",
    ]),
    numeroProcesso: pick(record, COLS.numeroProcesso),
    valorMulta: null,
    dataInicio: parseDataBr(pick(record, ["DATA DE INICIO DO ACORDO"])),
    dataFinal: parseDataBr(pick(record, ["DATA DE FIM DO ACORDO"])),
    dataPublicacao: null,
    orgaoSancionador: pick(record, COLS.orgao),
    ufOrgao: null,
    fundamentacao: null,
    buscaTexto: buildBuscaTexto(razaoSocial),
  };
};

const MAPPERS: Record<DatasetKey, RowMapper> = {
  ceis: sancaoMapper("ceis"),
  cnep: sancaoMapper("cnep"),
  ceaf: ceafMapper,
  cepim: cepimMapper,
  "acordos-leniencia": acordoMapper,
};

/**
 * Parseia o CSV (bytes ou string ISO-8859-1) de uma das 5 listas em SancaoRow[].
 * A primeira linha e tratada como cabecalho.
 */
export function parseSancoes(
  lista: DatasetKey,
  csv: Uint8Array | ArrayBuffer | string,
): SancaoRow[] {
  const records = parseCsvObjects(csv, undefined, decodeOpts);
  const mapper = MAPPERS[lista];

  return records.map(mapper).filter((row) => hasContent(row));
}

/** Parseia o CSV de Efeitos dos acordos de leniencia (1:N por id do acordo). */
export function parseEfeitos(
  csv: Uint8Array | ArrayBuffer | string,
): EfeitoRow[] {
  const records = parseCsvObjects(csv, undefined, decodeOpts);

  return records
    .map((record) => {
      const idAcordo = pick(record, ["ID DO ACORDO"]) ?? "";
      const documento = pick(record, ["CNPJ DO SANCIONADO", ...COLS.documento]);

      return {
        idAcordo,
        docNormalizado: documento ? onlyDigits(documento) : "",
        // Typo da fonte: "EFEITO DO ACORDO DE LENIENCIA".
        efeito: pick(record, [
          "EFEITO DO ACORDO DE LENIENCIA",
          "EFEITO DO ACORDO DE LENIENICA",
        ]),
        complemento: pick(record, ["COMPLEMENTO"]),
      };
    })
    .filter((row) => row.idAcordo !== "");
}

/** Linha tem algum conteudo util (evita gravar linhas em branco do CSV). */
function hasContent(row: SancaoRow): boolean {
  return Boolean(
    row.codigo ||
    row.documento ||
    row.nome ||
    row.razaoSocial ||
    row.docNormalizado,
  );
}
