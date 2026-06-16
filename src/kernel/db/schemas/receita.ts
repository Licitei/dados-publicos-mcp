import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const receita = pgTable(
  "receita",
  {
    id: serial("id").primaryKey(),
    sqReceita: text("sq_receita"),
    sqCandidato: text("sq_candidato"),
    cpfCandidato: text("cpf_candidato"),
    anoEleicao: integer("ano_eleicao"),
    cpfCnpjDoador: text("cpf_cnpj_doador"),
    nomeDoador: text("nome_doador"),
    nomeDoadorRfb: text("nome_doador_rfb"),
    cnaeCodigo: text("cnae_codigo"),
    cnaeDescricao: text("cnae_descricao"),
    ufDoador: text("uf_doador"),
    valor: real("valor"),
    data: text("data"),
    origem: text("origem"),
    natureza: text("natureza"),
    recibo: text("recibo"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("receita_doador").on(t.cpfCnpjDoador),
    index("receita_sq").on(t.sqReceita),
    index("receita_candidato").on(t.sqCandidato),
    index("receita_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("receita_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
