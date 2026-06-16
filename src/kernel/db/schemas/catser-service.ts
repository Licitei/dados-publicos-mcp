import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const catserService = pgTable(
  "catser_service",
  {
    codigoServico: integer("codigo_servico").primaryKey(),
    nomeServico: text("nome_servico"),
    codigoSecao: integer("codigo_secao"),
    nomeSecao: text("nome_secao"),
    codigoDivisao: integer("codigo_divisao"),
    nomeDivisao: text("nome_divisao"),
    codigoGrupo: integer("codigo_grupo"),
    nomeGrupo: text("nome_grupo"),
    codigoClasse: integer("codigo_classe"),
    nomeClasse: text("nome_classe"),
    codigoSubclasse: integer("codigo_subclasse"),
    nomeSubclasse: text("nome_subclasse"),
    statusServico: boolean("status_servico").notNull(),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("catser_service_secao").on(t.codigoSecao),
    index("catser_service_divisao").on(t.codigoDivisao),
    index("catser_service_grupo").on(t.codigoGrupo),
    index("catser_service_classe").on(t.codigoClasse),
    index("catser_service_subclasse").on(t.codigoSubclasse),
    index("catser_service_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("catser_service_busca_trgm").using(
      "gin",
      t.busca.op("gin_trgm_ops")
    ),
  ]
);
