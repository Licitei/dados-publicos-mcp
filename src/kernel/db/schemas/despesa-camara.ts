import { index, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const cota = pgTable(
  "cota",
  {
    id: serial("id").primaryKey(),
    nuDeputadoId: integer("nu_deputado_id"),
    ideCadastro: integer("ide_cadastro"),
    nomeParlamentar: text("nome_parlamentar"),
    cpfDeputado: text("cpf_deputado"),
    sgUf: text("sg_uf"),
    sgPartido: text("sg_partido"),
    numSubCota: integer("num_sub_cota"),
    txtDescricao: text("txt_descricao"),
    txtFornecedor: text("txt_fornecedor"),
    cnpjCpf: text("cnpj_cpf"),
    cnpjCpfNorm: text("cnpj_cpf_norm"),
    datEmissao: text("dat_emissao"),
    vlrDocumento: real("vlr_documento"),
    vlrGlosa: real("vlr_glosa"),
    vlrLiquido: real("vlr_liquido"),
    numMes: integer("num_mes"),
    numAno: integer("num_ano"),
    ideDocumento: text("ide_documento"),
    urlDocumento: text("url_documento"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("cota_cnpj").on(t.cnpjCpfNorm),
    index("cota_deputado").on(t.nuDeputadoId),
    index("cota_ano").on(t.numAno),
    index("cota_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("cota_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
