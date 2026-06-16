import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const bem = pgTable(
  "bem",
  {
    id: serial("id").primaryKey(),
    sqCandidato: text("sq_candidato"),
    anoEleicao: integer("ano_eleicao"),
    ufSigla: text("uf_sigla"),
    ordem: text("ordem"),
    tipoCodigo: text("tipo_codigo"),
    tipoDescricao: text("tipo_descricao"),
    descricao: text("descricao"),
    valor: real("valor"),
  },
  (t) => [index("bem_sq").on(t.sqCandidato)]
);
