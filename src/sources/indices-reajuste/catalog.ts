import { Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";

export const series = [
  { codigo: 433, serie: "IPCA" },
  { codigo: 188, serie: "INPC" },
  { codigo: 189, serie: "IGP-M" },
  { codigo: 190, serie: "IGP-DI" },
  { codigo: 192, serie: "INCC-M" },
  { codigo: 7478, serie: "IPCA-15" },
];

export const indiceReajusteTable: DuckTable = {
  name: "indice_reajuste",
  key: "id",
  columns: {
    id: "VARCHAR",
    serie: "VARCHAR",
    codigo: "VARCHAR",
    mes: "VARCHAR",
    valor: "DOUBLE",
    tipo: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const SgsPayload = Schema.Array(
  Schema.Struct({ data: Schema.String, valor: Schema.String })
).pipe(Schema.check(Schema.isMinLength(1)));
export const SidraPayload = Schema.Array(
  Schema.Struct({ V: Schema.String, D3C: Schema.String })
).pipe(Schema.check(Schema.isMinLength(2)));

const IndicesErrorCode = Schema.Literals(["indices.DOWNLOAD", "indices.PARSE"]);
export class IndicesError extends Schema.TaggedError<
  IndicesError,
  { readonly brand: unique symbol }
>()("IndicesError", { code: IndicesErrorCode, cause: Schema.optional(Schema.String) }) {
  override get message() {
    return this.code === "indices.PARSE"
      ? "Resposta inválida da série oficial de reajuste."
      : "Falha ao baixar os índices oficiais de reajuste.";
  }
}

export const IndiceRow = Schema.Struct({
  id: Schema.String,
  serie: Schema.String,
  codigo: Schema.String,
  mes: Schema.String,
  valor: Schema.Finite,
  tipo: Schema.Literals(["taxa_mensal", "numero_indice"]),
  fonte: Schema.String,
  busca: Schema.String,
});
