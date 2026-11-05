import { Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";

export const listaSujaUrl =
  "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.csv";
export const listaSujaTable: DuckTable = {
  name: "mte_lista_suja",
  key: "id",
  columns: {
    id: "VARCHAR",
    anoFiscalizacao: "INTEGER",
    uf: "VARCHAR",
    nome: "VARCHAR",
    documento: "VARCHAR",
    cnpj: "VARCHAR",
    estabelecimento: "VARCHAR",
    trabalhadores: "INTEGER",
    cnae: "VARCHAR",
    dataDecisao: "VARCHAR",
    inclusao: "VARCHAR",
    fonte: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};
const required = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
export const ListaSujaRow = Schema.Struct({
  id: required,
  anoFiscalizacao: Schema.NullOr(Schema.Finite),
  uf: Schema.String,
  nome: required,
  documento: required,
  cnpj: Schema.NullOr(Schema.String),
  estabelecimento: Schema.String,
  trabalhadores: Schema.NullOr(Schema.Finite),
  cnae: Schema.String,
  dataDecisao: Schema.String,
  inclusao: Schema.String,
  fonte: Schema.String,
  busca: Schema.String,
});
const ListaSujaErrorCode = Schema.Literals([
  "mte.BLOCKED",
  "mte.DOWNLOAD",
  "mte.PARSE",
  "mte.EMPTY",
]);
export class ListaSujaError extends Schema.TaggedError<
  ListaSujaError,
  { readonly brand: unique symbol }
>()("ListaSujaError", { code: ListaSujaErrorCode, cause: Schema.optional(Schema.String) }) {
  override get message() {
    return this.code === "mte.BLOCKED"
      ? "O gov.br bloqueou a Lista Suja do MTE (HTTP 403), mesmo com cabeçalhos de navegador. Nenhum espelho defasado foi usado."
      : this.code === "mte.EMPTY"
        ? "O cadastro do MTE não contém registros válidos; o índice anterior foi preservado."
        : this.code === "mte.PARSE"
          ? "Formato inesperado do cadastro de empregadores do MTE."
          : "Falha ao baixar o cadastro de empregadores do MTE.";
  }
}
