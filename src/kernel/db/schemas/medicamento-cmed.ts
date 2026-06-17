import { index, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const medicamentoCmed = pgTable(
  "medicamento_cmed",
  {
    id: serial("id").primaryKey(),
    substancia: text("substancia"),
    cnpj: text("cnpj"),
    docNormalizado: text("doc_normalizado"),
    laboratorio: text("laboratorio"),
    ggrem: text("ggrem"),
    registro: text("registro"),
    ean1: text("ean1"),
    produto: text("produto"),
    apresentacao: text("apresentacao"),
    classeTerapeutica: text("classe_terapeutica"),
    tarja: text("tarja"),
    pfSemImpostos: real("pf_sem_impostos"),
    pmvgSemImpostos: real("pmvg_sem_impostos"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("medicamento_cmed_ean").on(t.ean1),
    index("medicamento_cmed_ggrem").on(t.ggrem),
    index("medicamento_cmed_registro").on(t.registro),
    index("medicamento_cmed_doc").on(t.docNormalizado),
    index("medicamento_cmed_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("medicamento_cmed_busca_trgm").using(
      "gin",
      t.busca.op("gin_trgm_ops")
    ),
  ]
);
