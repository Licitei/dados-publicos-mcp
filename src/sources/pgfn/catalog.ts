import { Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";
import { indexByKey, numeroBr, pickFirst } from "../../kernel/csv/fields";
import { publicDocument } from "../../kernel/text/document";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const PgfnDataset = Schema.Literals(["previdenciario", "fgts", "nao_previdenciario"]);
export type PgfnDataset = (typeof PgfnDataset)["Type"];

const archives: Record<PgfnDataset, string> = {
  previdenciario: "Dados_abertos_Previdenciario.zip",
  fgts: "Dados_abertos_FGTS.zip",
  nao_previdenciario: "Dados_abertos_Nao_Previdenciario.zip",
};
export const pgfnUrl = (dataset: PgfnDataset) =>
  `https://dadosabertos.pgfn.gov.br/${archives[dataset]}`;

export const pgfnTable: DuckTable = {
  name: "pgfn_divida",
  key: "id",
  columns: {
    id: "VARCHAR",
    tipo: "VARCHAR",
    documento: "VARCHAR",
    cnpj: "VARCHAR",
    nome: "VARCHAR",
    uf: "VARCHAR",
    inscricao: "VARCHAR",
    tipoDevedor: "VARCHAR",
    situacao: "VARCHAR",
    dataInscricao: "VARCHAR",
    valorConsolidado: "DOUBLE",
    ajuizado: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
export const pgfnNaoPrevidenciarioTable: DuckTable = {
  ...pgfnTable,
  name: "pgfn_divida_nao_previdenciaria",
};

const PgfnErrorCode = Schema.Literals(["pgfn.DOWNLOAD", "pgfn.PARSE", "pgfn.EMPTY"]);
export class PgfnError extends Schema.TaggedError<PgfnError, { readonly brand: unique symbol }>()(
  "PgfnError",
  { code: PgfnErrorCode, cause: Schema.optional(Schema.String) }
) {
  override get message() {
    return this.code === "pgfn.DOWNLOAD"
      ? "Falha ao baixar os arquivos de dívida ativa da PGFN."
      : this.code === "pgfn.EMPTY"
        ? "O arquivo da PGFN não contém registros CSV válidos; o índice anterior foi preservado."
        : "Falha ao interpretar os arquivos da PGFN.";
  }
}

export const PgfnRow = Schema.Struct({
  id: Schema.String,
  tipo: PgfnDataset,
  documento: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  cnpj: Schema.NullOr(Schema.String),
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  uf: Schema.String,
  inscricao: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  tipoDevedor: Schema.String,
  situacao: Schema.String,
  dataInscricao: Schema.String,
  valorConsolidado: Schema.Finite,
  ajuizado: Schema.String,
  fonte: Schema.String,
  busca: Schema.String,
});

const PgfnMapping = Schema.Struct({
  row: Schema.Record(Schema.String, Schema.String),
  dataset: PgfnDataset,
  file: Schema.String,
  position: Schema.Finite,
});

export const pgfnRow = ({ row, dataset, file, position }: (typeof PgfnMapping)["Type"]) => {
  const indexed = indexByKey(row);
  const documento = publicDocument(
    pickFirst(indexed, ["CPF_CNPJ", "CPF/CNPJ", "CPF_CNPJ_DEVEDOR"])
  );
  const nome = pickFirst(indexed, ["NOME_DEVEDOR", "NOME"]);
  return {
    id: `${dataset}:${file}:${position}`,
    tipo: dataset,
    documento,
    cnpj: onlyDigits(documento).length === 14 ? onlyDigits(documento) : null,
    nome,
    uf: pickFirst(indexed, ["UF_DEVEDOR", "UF"]),
    inscricao: pickFirst(indexed, ["NUMERO_INSCRICAO"]),
    tipoDevedor: pickFirst(indexed, ["TIPO_DEVEDOR"]),
    situacao: pickFirst(indexed, ["SITUACAO_INSCRICAO"]),
    dataInscricao: pickFirst(indexed, ["DATA_INSCRICAO"]),
    valorConsolidado: numeroBr(pickFirst(indexed, ["VALOR_CONSOLIDADO"])),
    ajuizado: pickFirst(indexed, ["INDICADOR_AJUIZADO"]),
    fonte: pgfnUrl(dataset),
    busca: normalize(nome),
  };
};

export const PgfnIndex = Schema.Struct({
  heavy: Schema.Boolean,
  datasets: Schema.Array(PgfnDataset),
});
