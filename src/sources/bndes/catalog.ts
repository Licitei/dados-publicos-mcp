import { Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";

export const bndesDatasets = [
  { key: "nao_automaticas", package: "operacoes-financiamento", resource: "nao automaticas" },
  {
    key: "entes_publicos",
    package: "operacoes-com-entes-da-administracao-publica-direta",
    resource: "entes da administracao direta",
  },
];
export const CkanPackage = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.Struct({
    resources: Schema.Array(
      Schema.Struct({ name: Schema.String, format: Schema.String, url: Schema.String })
    ),
  }),
});
export const bndesOperacaoTable: DuckTable = {
  name: "bndes_operacao",
  key: "id",
  columns: {
    id: "VARCHAR",
    documento: "VARCHAR",
    cnpj: "VARCHAR",
    nome: "VARCHAR",
    descricao: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    codigoIbge: "VARCHAR",
    contrato: "VARCHAR",
    dataContratacao: "VARCHAR",
    valorContratado: "DOUBLE",
    valorDesembolsado: "DOUBLE",
    custoFinanceiro: "VARCHAR",
    juros: "DOUBLE",
    carenciaMeses: "INTEGER",
    amortizacaoMeses: "INTEGER",
    produto: "VARCHAR",
    setorCnae: "VARCHAR",
    porte: "VARCHAR",
    natureza: "VARCHAR",
    situacao: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const bndesEnteTable: DuckTable = {
  name: "bndes_ente",
  key: "id",
  columns: {
    id: "VARCHAR",
    nome: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    programa: "VARCHAR",
    modalidade: "VARCHAR",
    dataNivelAtual: "VARCHAR",
    nivelAtual: "VARCHAR",
    valorOperacao: "DOUBLE",
    valorDesembolsado: "DOUBLE",
    saldoLiberar: "DOUBLE",
    objetivo: "VARCHAR",
    situacao: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
const required = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
const amount = Schema.NullOr(Schema.Finite);
export const BndesOperacaoRow = Schema.Struct({
  id: required,
  documento: Schema.String,
  cnpj: Schema.NullOr(Schema.String),
  nome: required,
  descricao: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  codigoIbge: Schema.String,
  contrato: Schema.String,
  dataContratacao: Schema.String,
  valorContratado: amount,
  valorDesembolsado: amount,
  custoFinanceiro: Schema.String,
  juros: amount,
  carenciaMeses: amount,
  amortizacaoMeses: amount,
  produto: Schema.String,
  setorCnae: Schema.String,
  porte: Schema.String,
  natureza: Schema.String,
  situacao: Schema.String,
  fonte: required,
  busca: Schema.String,
});
export const BndesEnteRow = Schema.Struct({
  id: required,
  nome: required,
  uf: Schema.String,
  municipio: Schema.String,
  programa: Schema.String,
  modalidade: Schema.String,
  dataNivelAtual: Schema.String,
  nivelAtual: Schema.String,
  valorOperacao: amount,
  valorDesembolsado: amount,
  saldoLiberar: amount,
  objetivo: Schema.String,
  situacao: Schema.String,
  fonte: required,
  busca: Schema.String,
});
const BndesErrorCode = Schema.Literals([
  "bndes.DOWNLOAD",
  "bndes.RESOURCE",
  "bndes.PARSE",
  "bndes.EMPTY",
]);
export class BndesError extends Schema.TaggedError<BndesError, { readonly brand: unique symbol }>()(
  "BndesError",
  { code: BndesErrorCode, cause: Schema.optional(Schema.String) }
) {
  override get message() {
    return this.code === "bndes.RESOURCE"
      ? "O CKAN do BNDES não publicou o CSV esperado; operações indiretas automáticas não foram usadas como substituição."
      : this.code === "bndes.EMPTY"
        ? "O CSV do BNDES está vazio; o índice anterior foi preservado."
        : this.code === "bndes.PARSE"
          ? "Formato inesperado dos dados de operações do BNDES."
          : "Falha ao baixar os dados de operações do BNDES.";
  }
}
