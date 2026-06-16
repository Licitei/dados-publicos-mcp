import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const despesa = pgTable(
  "despesa",
  {
    id: serial("id").primaryKey(),
    sqDespesa: text("sq_despesa"),
    sqCandidato: text("sq_candidato"),
    cpfCandidato: text("cpf_candidato"),
    anoEleicao: integer("ano_eleicao"),
    cpfCnpjForn: text("cpf_cnpj_forn"),
    nomeForn: text("nome_forn"),
    nomeFornRfb: text("nome_forn_rfb"),
    cnaeCodigo: text("cnae_codigo"),
    cnaeDescricao: text("cnae_descricao"),
    ufForn: text("uf_forn"),
    valor: real("valor"),
    data: text("data"),
    descricao: text("descricao"),
    documento: text("documento"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("despesa_forn").on(t.cpfCnpjForn),
    index("despesa_sq").on(t.sqDespesa),
    index("despesa_candidato").on(t.sqCandidato),
    index("despesa_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("despesa_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
