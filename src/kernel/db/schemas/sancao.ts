import { index, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const sancao = pgTable(
  "sancao",
  {
    id: serial("id").primaryKey(),
    lista: text("lista").notNull(),
    codigo: text("codigo"),
    tipoPessoa: text("tipo_pessoa"),
    documento: text("documento"),
    docNormalizado: text("doc_normalizado").notNull(),
    nome: text("nome"),
    razaoSocial: text("razao_social"),
    categoria: text("categoria"),
    numeroProcesso: text("numero_processo"),
    valorMulta: real("valor_multa"),
    dataInicio: text("data_inicio"),
    dataFinal: text("data_final"),
    dataPublicacao: text("data_publicacao"),
    orgaoSancionador: text("orgao_sancionador"),
    ufOrgao: text("uf_orgao"),
    fundamentacao: text("fundamentacao"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("sancao_doc").on(t.docNormalizado),
    index("sancao_lista").on(t.lista),
    index("sancao_data_inicio").on(t.dataInicio),
    index("sancao_data_final").on(t.dataFinal),
    index("sancao_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("sancao_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
