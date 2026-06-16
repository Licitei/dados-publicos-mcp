import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const capagMunicipio = pgTable(
  "capag_municipio",
  {
    id: serial("id").primaryKey(),
    codIbge: text("cod_ibge").notNull(),
    nome: text("nome").notNull(),
    nomeNorm: text("nome_norm").notNull(),
    uf: text("uf").notNull(),
    anoBase: integer("ano_base").notNull(),
    posicao: text("posicao"),
    indicador1: real("indicador1"),
    nota1: text("nota1"),
    indicador2: real("indicador2"),
    nota2: text("nota2"),
    indicador3: real("indicador3"),
    nota3: text("nota3"),
    capag: text("capag"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("capag_municipio_cod_ano").on(t.codIbge, t.anoBase),
    index("capag_municipio_uf").on(t.uf),
    index("capag_municipio_capag").on(t.capag),
    index("capag_municipio_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("capag_municipio_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
