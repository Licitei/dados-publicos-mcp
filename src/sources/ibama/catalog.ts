import { Schema } from "effect";
import * as Str from "effect/String";
import type { DuckTable } from "../../kernel/duck/duck";
import { indexByKey, numeroBr, pickFirst } from "../../kernel/csv/fields";
import { publicDocument, publicText } from "../../kernel/text/document";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const IbamaDataset = Schema.Literals(["auto_infracao", "termo_embargo"]);
export type IbamaDataset = (typeof IbamaDataset)["Type"];
export const ibamaUrl = (dataset: IbamaDataset) =>
  `https://dadosabertos.ibama.gov.br/dados/SIFISC/${dataset}/${dataset}/${dataset}_csv.zip`;
export const ibamaAutoTable: DuckTable = {
  name: "ibama_auto",
  key: "id",
  columns: {
    id: "VARCHAR",
    numero: "VARCHAR",
    serie: "VARCHAR",
    documento: "VARCHAR",
    cnpj: "VARCHAR",
    nome: "VARCHAR",
    processo: "VARCHAR",
    descricao: "VARCHAR",
    situacao: "VARCHAR",
    cancelado: "BOOLEAN",
    desembargado: "BOOLEAN",
    dataDesembargo: "VARCHAR",
    tipoDesembargo: "VARCHAR",
    descricaoDesembargo: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    codigoIbge: "VARCHAR",
    data: "VARCHAR",
    valor: "DOUBLE",
    area: "DOUBLE",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const ibamaEmbargoTable: DuckTable = { ...ibamaAutoTable, name: "ibama_embargo" };
export const ibamaTables: Record<IbamaDataset, DuckTable> = {
  auto_infracao: ibamaAutoTable,
  termo_embargo: ibamaEmbargoTable,
};
export const IbamaRow = Schema.Struct({
  id: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  numero: Schema.String,
  serie: Schema.String,
  documento: Schema.String,
  cnpj: Schema.NullOr(Schema.String),
  nome: Schema.String,
  processo: Schema.String,
  descricao: Schema.String,
  situacao: Schema.String,
  cancelado: Schema.NullOr(Schema.Boolean),
  desembargado: Schema.NullOr(Schema.Boolean),
  dataDesembargo: Schema.String,
  tipoDesembargo: Schema.String,
  descricaoDesembargo: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  codigoIbge: Schema.String,
  data: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  area: Schema.NullOr(Schema.Finite),
  fonte: Schema.String,
  busca: Schema.String,
});
const IbamaMapping = Schema.Struct({
  dataset: IbamaDataset,
  row: Schema.Record(Schema.String, Schema.String),
});
export const ibamaRow = (spec: (typeof IbamaMapping)["Type"]) => {
  const fields = indexByKey(spec.row);
  const pick = (...names: readonly string[]) => pickFirst(fields, names);
  const documento = publicDocument(pick("CPF_CNPJ_INFRATOR", "CPF_CNPJ_EMBARGADO"));
  const nome = publicText(pick("NOME_INFRATOR", "NOME_EMBARGADO"));
  const descricao = publicText(pick("DES_AUTO_INFRACAO", "DES_INFRACAO", "DES_TAD"));
  const flag = (value: string) =>
    Str.toUpperCase(value) === "S" ? true : Str.toUpperCase(value) === "N" ? false : null;
  return {
    id: pick("SEQ_AUTO_INFRACAO", "SEQ_TAD"),
    numero: pick("NUM_AUTO_INFRACAO", "NUM_TAD"),
    serie: pick("SER_AUTO_INFRACAO", "SER_TAD"),
    documento,
    cnpj: onlyDigits(documento).length === 14 ? onlyDigits(documento) : null,
    nome,
    processo: pick("NUM_PROCESSO"),
    descricao,
    situacao: pick("DES_STATUS_FORMULARIO", "DS_SIT_AUTO_AIE", "DES_STATUS_FORMULARIO_AIE"),
    cancelado: flag(pick("SIT_CANCELADO")),
    desembargado: flag(pick("SIT_DESEMBARGO")),
    dataDesembargo: pick("DAT_DESEMBARGO"),
    tipoDesembargo: pick("TIPO_DESEMBARGO"),
    descricaoDesembargo: publicText(pick("DES_DESEMBARGO")),
    uf: pick("UF"),
    municipio: pick("MUNICIPIO"),
    codigoIbge: pick("COD_MUNICIPIO"),
    data: pick("DAT_HORA_AUTO_INFRACAO", "DAT_EMBARGO"),
    valor: numeroBr(pick("VAL_AUTO_INFRACAO")),
    area: numeroBr(pick("QT_AREA", "QTD_AREA", "QTD_AREA_EMBARGADA")),
    fonte: ibamaUrl(spec.dataset),
    busca: normalize(`${nome} ${descricao}`),
  };
};
const IbamaErrorCode = Schema.Literals(["ibama.DOWNLOAD", "ibama.PARSE", "ibama.EMPTY"]);
export class IbamaError extends Schema.TaggedError<IbamaError, { readonly brand: unique symbol }>()(
  "IbamaError",
  { code: IbamaErrorCode, cause: Schema.optional(Schema.String) }
) {
  override get message() {
    return this.code === "ibama.DOWNLOAD"
      ? "Falha ao baixar os autos ou embargos do IBAMA."
      : this.code === "ibama.EMPTY"
        ? "O arquivo do IBAMA não contém registros CSV; o índice anterior foi preservado."
        : "Formato inesperado dos autos ou embargos do IBAMA.";
  }
}
