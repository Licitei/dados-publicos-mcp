import {
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const siconfiFato = pgTable(
  "siconfi_fato",
  {
    id: serial("id").primaryKey(),
    idEnte: text("id_ente").notNull(),
    exercicio: integer("exercicio"),
    demonstrativo: text("demonstrativo").notNull(),
    anexo: text("anexo"),
    rotulo: text("rotulo"),
    coluna: text("coluna"),
    codConta: text("cod_conta"),
    conta: text("conta"),
    valor: doublePrecision("valor"),
    instituicao: text("instituicao"),
    uf: text("uf"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("siconfi_fato_ente").on(t.idEnte),
    index("siconfi_fato_exercicio").on(t.exercicio),
    index("siconfi_fato_demonstrativo").on(t.demonstrativo),
    index("siconfi_fato_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("siconfi_fato_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
