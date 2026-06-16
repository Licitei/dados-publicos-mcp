import { index, pgTable, real, serial, text } from "drizzle-orm/pg-core";

export const precoPraticado = pgTable(
  "preco_praticado",
  {
    id: serial("id").primaryKey(),
    idItemCompra: text("id_item_compra"),
    idCompra: text("id_compra"),
    codigoItemCatalogo: text("codigo_item_catalogo"),
    descricaoItem: text("descricao_item"),
    precoUnitario: real("preco_unitario"),
    quantidade: real("quantidade"),
    unidadeFornecimento: text("unidade_fornecimento"),
    niFornecedor: text("ni_fornecedor"),
    docNormalizado: text("doc_normalizado"),
    nomeFornecedor: text("nome_fornecedor"),
    marca: text("marca"),
    dataCompra: text("data_compra"),
    estado: text("estado"),
    codigoMunicipio: text("codigo_municipio"),
    municipio: text("municipio"),
    codigoUasg: text("codigo_uasg"),
    nomeOrgao: text("nome_orgao"),
    codigoClasse: text("codigo_classe"),
    nomeClasse: text("nome_classe"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("preco_praticado_item").on(t.codigoItemCatalogo),
    index("preco_praticado_doc").on(t.docNormalizado),
    index("preco_praticado_estado").on(t.estado),
    index("preco_praticado_id_item").on(t.idItemCompra),
    index("preco_praticado_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("preco_praticado_busca_trgm").using(
      "gin",
      t.busca.op("gin_trgm_ops")
    ),
  ]
);
