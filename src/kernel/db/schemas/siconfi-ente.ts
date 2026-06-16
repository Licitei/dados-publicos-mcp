import { index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const siconfiEnte = pgTable(
  "siconfi_ente",
  {
    id: serial("id").primaryKey(),
    codIbge: text("cod_ibge").notNull(),
    ente: text("ente").notNull(),
    uf: text("uf"),
    esfera: text("esfera"),
    regiao: text("regiao"),
    populacao: integer("populacao"),
    cnpj: text("cnpj"),
    exercicio: integer("exercicio"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("siconfi_ente_cod").on(t.codIbge),
    index("siconfi_ente_cnpj").on(t.cnpj),
    index("siconfi_ente_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("siconfi_ente_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
