import {
  customType,
  index,
  integer,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core";

export const embeddingDimensions = 384;

const ltree = customType<{ data: string }>({ dataType: () => "ltree" });

export const node = pgTable(
  "legislacao_node",
  {
    path: ltree("path").primaryKey(),
    normaId: text("norma_id").notNull(),
    parentPath: ltree("parent_path"),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    heading: text("heading").notNull(),
    text: text("text").notNull(),
    summary: text("summary").notNull(),
    position: integer("position").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("legislacao_node_gist").using("gist", t.path),
    index("legislacao_node_norma").on(t.normaId),
    index("legislacao_node_bm25")
      .using("bm25", t.text)
      .with({ text_config: "portuguese" }),
    index("legislacao_node_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
