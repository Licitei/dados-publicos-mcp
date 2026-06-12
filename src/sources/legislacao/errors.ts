import { Schema } from "effect";

export const LegislacaoErrorCode = Schema.Literals([
  "legislacao.NORMA_NOT_FOUND",
  "legislacao.NODE_NOT_FOUND",
  "legislacao.NOT_INDEXED",
  "legislacao.PARSE",
]);
export type LegislacaoErrorCode = (typeof LegislacaoErrorCode)["Type"];

export class LegislacaoError extends Schema.TaggedErrorClass<LegislacaoError>()(
  "LegislacaoError",
  {
    code: LegislacaoErrorCode,
    norma: Schema.optional(Schema.String),
    path: Schema.optional(Schema.String),
    url: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "legislacao.NORMA_NOT_FOUND":
        return `Norma nao encontrada no catalogo: ${this.norma}`;
      case "legislacao.NODE_NOT_FOUND":
        return `Trecho nao encontrado: ${this.path}`;
      case "legislacao.NOT_INDEXED":
        return `Norma "${this.norma}" existe no catalogo mas ainda nao foi indexada.`;
      case "legislacao.PARSE":
        return `Falha ao interpretar o HTML do Planalto: ${this.url}`;
    }
  }
}
