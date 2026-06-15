import { index, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const empresa = pgTable(
  "empresa",
  {
    id: serial("id").primaryKey(),
    cnpjBasico: text("cnpj_basico"),
    razaoSocial: text("razao_social"),
    razaoSocialNorm: text("razao_social_norm"),
    naturezaJuridica: text("natureza_juridica"),
    qualificacaoResponsavel: text("qualificacao_responsavel"),
    capitalSocial: real("capital_social"),
    porte: text("porte"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("empresa_cnpj_basico").on(t.cnpjBasico),
    index("empresa_natureza").on(t.naturezaJuridica),
    index("empresa_porte").on(t.porte),
    index("empresa_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("empresa_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
