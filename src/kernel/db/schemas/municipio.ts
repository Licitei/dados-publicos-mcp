import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const municipio = pgTable(
  "municipio",
  {
    id: text("id").primaryKey(),
    nome: text("nome").notNull(),
    nomeNormalizado: text("nome_normalizado").notNull(),
    ufSigla: text("uf_sigla").notNull(),
    ufId: integer("uf_id").notNull(),
    ufNome: text("uf_nome").notNull(),
    mesorregiaoId: integer("mesorregiao_id"),
    mesorregiaoNome: text("mesorregiao_nome"),
    regiaoSigla: text("regiao_sigla").notNull(),
  },
  (t) => [
    index("municipio_uf").on(t.ufSigla),
    index("municipio_nome_trgm").using("gin", t.nomeNormalizado.op("gin_trgm_ops")),
  ]
);
