import { index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const diarioCnpj = pgTable(
  "diario_cnpj",
  {
    id: serial("id").primaryKey(),
    diarioId: integer("diario_id").notNull(),
    cnpj: text("cnpj").notNull(),
  },
  (t) => [
    index("diario_cnpj_cnpj").on(t.cnpj),
    index("diario_cnpj_diario").on(t.diarioId),
  ]
);
