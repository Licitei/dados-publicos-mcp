import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const capagEstado = pgTable(
  "capag_estado",
  {
    id: serial("id").primaryKey(),
    uf: text("uf").notNull(),
    ano: integer("ano").notNull(),
    indicador1: real("indicador1"),
    nota1: text("nota1"),
    indicador2: real("indicador2"),
    nota2: text("nota2"),
    indicador3: real("indicador3"),
    nota3: text("nota3"),
    capag: text("capag"),
    qualidadeInfo: text("qualidade_info"),
    observacao: text("observacao"),
  },
  (t) => [
    index("capag_estado_uf_ano").on(t.uf, t.ano),
    index("capag_estado_capag").on(t.capag),
  ]
);
