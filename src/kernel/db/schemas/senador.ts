import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const senador = pgTable(
  "senador",
  {
    id: serial("id").primaryKey(),
    codigo: text("codigo"),
    nome: text("nome"),
    nomeCompleto: text("nome_completo"),
    sexo: text("sexo"),
    partido: text("partido"),
    uf: text("uf"),
    email: text("email"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("senador_codigo").on(t.codigo),
    index("senador_uf").on(t.uf),
    index("senador_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
