import { Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";

export const cvmUrls = {
  companhia: "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv",
  fundo: "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv",
  processos: "https://dados.cvm.gov.br/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip",
};

export const cvmCompanhiaTable: DuckTable = {
  name: "cvm_companhia",
  key: "id",
  columns: {
    id: "VARCHAR",
    cnpj: "VARCHAR",
    nome: "VARCHAR",
    registro: "VARCHAR",
    situacao: "VARCHAR",
    dataRegistro: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const cvmFundoTable: DuckTable = { ...cvmCompanhiaTable, name: "cvm_fundo" };
export const cvmProcessoTable: DuckTable = {
  name: "cvm_processo",
  key: "id",
  columns: {
    id: "VARCHAR",
    nup: "VARCHAR",
    objeto: "VARCHAR",
    ementa: "VARCHAR",
    dataAbertura: "VARCHAR",
    fase: "VARCHAR",
    subfase: "VARCHAR",
    dataMovimentacao: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const cvmAcusadoTable: DuckTable = {
  name: "cvm_acusado",
  key: "id",
  columns: {
    id: "VARCHAR",
    nup: "VARCHAR",
    nome: "VARCHAR",
    situacao: "VARCHAR",
    dataSituacao: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const cvmTables = [cvmCompanhiaTable, cvmFundoTable, cvmProcessoTable, cvmAcusadoTable];
const required = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
export const CvmCadastroRow = Schema.Struct({
  id: required,
  cnpj: Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{14}$/))),
  nome: required,
  registro: Schema.String,
  situacao: Schema.String,
  dataRegistro: Schema.String,
  fonte: required,
  busca: Schema.String,
});
export const CvmProcessoRow = Schema.Struct({
  id: required,
  nup: required,
  objeto: Schema.String,
  ementa: Schema.String,
  dataAbertura: Schema.String,
  fase: Schema.String,
  subfase: Schema.String,
  dataMovimentacao: Schema.String,
  fonte: required,
  busca: Schema.String,
});
export const CvmAcusadoRow = Schema.Struct({
  id: required,
  nup: required,
  nome: required,
  situacao: Schema.String,
  dataSituacao: Schema.String,
  fonte: required,
  busca: Schema.String,
});

const CvmErrorCode = Schema.Literals(["cvm.DOWNLOAD", "cvm.PARSE", "cvm.EMPTY"]);
export class CvmError extends Schema.TaggedError<CvmError, { readonly brand: unique symbol }>()(
  "CvmError",
  { code: CvmErrorCode, cause: Schema.optional(Schema.String) }
) {
  override get message() {
    return this.code === "cvm.DOWNLOAD"
      ? "Falha ao baixar os cadastros ou processos da CVM."
      : this.code === "cvm.EMPTY"
        ? "Os arquivos da CVM não contêm os registros esperados; o índice anterior foi preservado."
        : "Formato inesperado dos dados da CVM.";
  }
}
