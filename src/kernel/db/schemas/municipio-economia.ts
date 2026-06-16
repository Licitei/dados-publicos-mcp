import {
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const municipioEconomia = pgTable(
  "municipio_economia",
  {
    id: serial("id").primaryKey(),
    codIbge: text("cod_ibge").notNull(),
    nome: text("nome"),
    uf: text("uf"),
    ano: integer("ano").notNull(),
    populacao: integer("populacao"),
    pibMilReais: doublePrecision("pib_mil_reais"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("municipio_economia_cod").on(t.codIbge),
    index("municipio_economia_uf").on(t.uf),
    index("municipio_economia_ano").on(t.ano),
    index("municipio_economia_busca_trgm").using(
      "gin",
      t.busca.op("gin_trgm_ops")
    ),
  ]
);
