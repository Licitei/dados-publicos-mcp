import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const dominio = pgTable(
  "dominio",
  {
    id: serial("id").primaryKey(),
    tabela: text("tabela"),
    codigo: text("codigo"),
    descricao: text("descricao"),
  },
  (t) => [index("dominio_tabela_codigo").on(t.tabela, t.codigo)]
);
