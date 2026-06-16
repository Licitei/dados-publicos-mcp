import { index, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const sinapiInsumo = pgTable(
  "sinapi_insumo",
  {
    id: serial("id").primaryKey(),
    mesReferencia: text("mes_referencia"),
    codigo: text("codigo"),
    descricao: text("descricao"),
    unidade: text("unidade"),
    origem: text("origem"),
    classificacao: text("classificacao"),
    uf: text("uf"),
    precoMediano: real("preco_mediano"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("sinapi_insumo_codigo").on(t.codigo),
    index("sinapi_insumo_uf").on(t.uf),
    index("sinapi_insumo_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("sinapi_insumo_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
