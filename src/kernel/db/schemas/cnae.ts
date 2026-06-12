import { index, pgTable, text } from "drizzle-orm/pg-core";

export const cnae = pgTable(
  "cnae",
  {
    id: text("id").primaryKey(),
    descricao: text("descricao").notNull(),
    classeId: text("classe_id").notNull(),
    classeDescricao: text("classe_descricao").notNull(),
    grupoId: text("grupo_id").notNull(),
    grupoDescricao: text("grupo_descricao").notNull(),
    divisaoId: text("divisao_id").notNull(),
    divisaoDescricao: text("divisao_descricao").notNull(),
    secaoId: text("secao_id").notNull(),
    secaoDescricao: text("secao_descricao").notNull(),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("cnae_secao").on(t.secaoId),
    index("cnae_divisao").on(t.divisaoId),
    index("cnae_grupo").on(t.grupoId),
    index("cnae_classe").on(t.classeId),
    index("cnae_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
  ]
);
