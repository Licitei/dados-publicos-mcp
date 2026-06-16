import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

export const deputado = pgTable(
  "deputado",
  {
    id: text("id").primaryKey(),
    uri: text("uri"),
    nome: text("nome"),
    nomeCivil: text("nome_civil"),
    nomeNorm: text("nome_norm").notNull(),
    siglaSexo: text("sigla_sexo"),
    dataNascimento: text("data_nascimento"),
    dataFalecimento: text("data_falecimento"),
    ufNascimento: text("uf_nascimento"),
    municipioNascimento: text("municipio_nascimento"),
    idLegislaturaInicial: integer("id_legislatura_inicial"),
    idLegislaturaFinal: integer("id_legislatura_final"),
  },
  (t) => [
    index("deputado_uf").on(t.ufNascimento),
    index("deputado_nome_trgm").using("gin", t.nomeNorm.op("gin_trgm_ops")),
  ]
);
