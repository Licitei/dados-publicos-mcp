import { index, integer, pgTable, text, vector } from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const proposicao = pgTable(
  "proposicao",
  {
    id: text("id").primaryKey(),
    uri: text("uri"),
    siglaTipo: text("sigla_tipo"),
    numero: integer("numero"),
    ano: integer("ano"),
    ementa: text("ementa"),
    ementaDetalhada: text("ementa_detalhada"),
    keywords: text("keywords"),
    dataApresentacao: text("data_apresentacao"),
    situacao: text("situacao"),
    ultimoStatusData: text("ultimo_status_data"),
    ultimoStatusOrgao: text("ultimo_status_orgao"),
    busca: text("busca").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("proposicao_ano").on(t.ano),
    index("proposicao_tipo").on(t.siglaTipo),
    index("proposicao_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("proposicao_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
