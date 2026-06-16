import { index, integer, pgTable, text, vector } from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const ata = pgTable(
  "ata",
  {
    numeroControlePNCPAta: text("numero_controle_pncp_ata").primaryKey(),
    numeroControlePNCPCompra: text("numero_controle_pncp_compra"),
    anoAta: integer("ano_ata"),
    numeroAtaRegistroPreco: text("numero_ata_registro_preco"),
    objetoContratacao: text("objeto_contratacao"),
    vigenciaInicio: text("vigencia_inicio"),
    vigenciaFim: text("vigencia_fim"),
    dataAtualizacaoGlobal: text("data_atualizacao_global"),
    cnpjOrgao: text("cnpj_orgao"),
    nomeOrgao: text("nome_orgao"),
    codigoUnidadeOrgao: text("codigo_unidade_orgao"),
    ufSigla: text("uf_sigla"),
    busca: text("busca").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("ata_orgao").on(t.cnpjOrgao),
    index("ata_uf").on(t.ufSigla),
    index("ata_compra").on(t.numeroControlePNCPCompra),
    index("ata_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("ata_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
