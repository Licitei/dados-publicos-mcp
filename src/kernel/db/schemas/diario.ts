import {
  index,
  integer,
  pgTable,
  serial,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const diario = pgTable(
  "diario",
  {
    id: serial("id").primaryKey(),
    territoryId: text("territory_id").notNull(),
    uf: text("uf").notNull(),
    municipio: text("municipio").notNull(),
    ano: integer("ano"),
    data: text("data"),
    poder: text("poder"),
    edicao: text("edicao"),
    edicaoExtra: text("edicao_extra"),
    urlOriginal: text("url_original"),
    conteudo: text("conteudo").notNull(),
    busca: text("busca").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("diario_territory").on(t.territoryId),
    index("diario_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("diario_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
