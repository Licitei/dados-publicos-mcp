import { index, integer, pgTable, real, text, vector } from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const contrato = pgTable(
  "contrato",
  {
    numeroControlePNCP: text("numero_controle_pncp").primaryKey(),
    numeroControlePncpCompra: text("numero_controle_pncp_compra"),
    anoContrato: integer("ano_contrato"),
    sequencialContrato: integer("sequencial_contrato"),
    objetoContrato: text("objeto_contrato"),
    niFornecedor: text("ni_fornecedor"),
    tipoPessoa: text("tipo_pessoa"),
    nomeRazaoSocialFornecedor: text("nome_razao_social_fornecedor"),
    niFornecedorSubContratado: text("ni_fornecedor_sub_contratado"),
    nomeFornecedorSubContratado: text("nome_fornecedor_sub_contratado"),
    valorInicial: real("valor_inicial"),
    valorGlobal: real("valor_global"),
    valorAcumulado: real("valor_acumulado"),
    dataAssinatura: text("data_assinatura"),
    dataVigenciaInicio: text("data_vigencia_inicio"),
    dataVigenciaFim: text("data_vigencia_fim"),
    dataPublicacaoPncp: text("data_publicacao_pncp"),
    dataAtualizacaoGlobal: text("data_atualizacao_global"),
    orgaoCnpj: text("orgao_cnpj"),
    orgaoRazaoSocial: text("orgao_razao_social"),
    codigoIbge: text("codigo_ibge"),
    ufSigla: text("uf_sigla"),
    tipoContrato: text("tipo_contrato"),
    busca: text("busca").notNull(),
    buscaFornecedor: text("busca_fornecedor").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("contrato_ni_fornecedor").on(t.niFornecedor),
    index("contrato_orgao").on(t.orgaoCnpj),
    index("contrato_uf").on(t.ufSigla),
    index("contrato_ibge").on(t.codigoIbge),
    index("contrato_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("contrato_busca_fornecedor_bm25")
      .using("bm25", t.buscaFornecedor)
      .with({ text_config: "portuguese" }),
    index("contrato_busca_fornecedor_trgm").using(
      "gin",
      t.buscaFornecedor.op("gin_trgm_ops")
    ),
    index("contrato_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
