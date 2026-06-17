import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const ceapsDespesa = pgTable(
  "ceaps_despesa",
  {
    id: serial("id").primaryKey(),
    ano: integer("ano"),
    mes: integer("mes"),
    senador: text("senador"),
    tipoDespesa: text("tipo_despesa"),
    cnpjCpf: text("cnpj_cpf"),
    docNormalizado: text("doc_normalizado").notNull(),
    fornecedor: text("fornecedor"),
    documento: text("documento"),
    data: text("data"),
    detalhamento: text("detalhamento"),
    valorReembolsado: real("valor_reembolsado"),
    codDocumento: text("cod_documento"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("ceaps_doc").on(t.docNormalizado),
    index("ceaps_senador").on(t.senador),
    index("ceaps_ano").on(t.ano),
    index("ceaps_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("ceaps_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
