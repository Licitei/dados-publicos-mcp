import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const contratacao = pgTable(
  "contratacao",
  {
    numeroControlePNCP: text("numero_controle_pncp").primaryKey(),
    anoCompra: integer("ano_compra"),
    sequencialCompra: integer("sequencial_compra"),
    objetoCompra: text("objeto_compra"),
    modalidadeId: integer("modalidade_id"),
    modalidadeNome: text("modalidade_nome"),
    situacaoCompraNome: text("situacao_compra_nome"),
    valorTotalEstimado: real("valor_total_estimado"),
    valorTotalHomologado: real("valor_total_homologado"),
    dataPublicacaoPncp: text("data_publicacao_pncp"),
    dataAberturaProposta: text("data_abertura_proposta"),
    dataEncerramentoProposta: text("data_encerramento_proposta"),
    dataAtualizacaoGlobal: text("data_atualizacao_global"),
    orgaoCnpj: text("orgao_cnpj"),
    orgaoRazaoSocial: text("orgao_razao_social"),
    esferaId: text("esfera_id"),
    poderId: text("poder_id"),
    codigoIbge: text("codigo_ibge"),
    municipioNome: text("municipio_nome"),
    ufSigla: text("uf_sigla"),
    srp: boolean("srp"),
    busca: text("busca").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("contratacao_uf").on(t.ufSigla),
    index("contratacao_ibge").on(t.codigoIbge),
    index("contratacao_orgao").on(t.orgaoCnpj),
    index("contratacao_modalidade").on(t.modalidadeId),
    index("contratacao_publicacao").on(t.dataPublicacaoPncp),
    index("contratacao_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("contratacao_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
