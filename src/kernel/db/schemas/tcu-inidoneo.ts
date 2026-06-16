import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const tcuInidoneo = pgTable(
  "tcu_inidoneo",
  {
    id: serial("id").primaryKey(),
    lista: text("lista").notNull(),
    nome: text("nome"),
    documento: text("documento"),
    docNormalizado: text("doc_normalizado").notNull(),
    processo: text("processo"),
    deliberacao: text("deliberacao"),
    dataTransitoJulgado: text("data_transito_julgado"),
    dataFinal: text("data_final"),
    dataAcordao: text("data_acordao"),
    uf: text("uf"),
    municipio: text("municipio"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("tcu_inidoneo_doc").on(t.docNormalizado),
    index("tcu_inidoneo_lista").on(t.lista),
    index("tcu_inidoneo_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("tcu_inidoneo_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
