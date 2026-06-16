import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const receitaOriginario = pgTable(
  "receita_originario",
  {
    id: serial("id").primaryKey(),
    sqReceita: text("sq_receita"),
    anoEleicao: integer("ano_eleicao"),
    cpfCnpjOrig: text("cpf_cnpj_orig"),
    nomeOrig: text("nome_orig"),
    nomeOrigRfb: text("nome_orig_rfb"),
    tipoOrig: text("tipo_orig"),
    cnaeCodigo: text("cnae_codigo"),
    valor: real("valor"),
    data: text("data"),
  },
  (t) => [
    index("orig_cpf").on(t.cpfCnpjOrig),
    index("orig_sq").on(t.sqReceita),
  ]
);
