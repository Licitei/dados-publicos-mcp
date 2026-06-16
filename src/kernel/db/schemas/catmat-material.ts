import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { embeddingDimensions } from "../../embed/dimensions";

export const catmatMaterial = pgTable(
  "catmat_material",
  {
    codigoItem: integer("codigo_item").primaryKey(),
    codigoGrupo: integer("codigo_grupo"),
    nomeGrupo: text("nome_grupo"),
    codigoClasse: integer("codigo_classe"),
    nomeClasse: text("nome_classe"),
    codigoPdm: integer("codigo_pdm"),
    nomePdm: text("nome_pdm"),
    descricaoItem: text("descricao_item"),
    codigoNcm: text("codigo_ncm"),
    descricaoNcm: text("descricao_ncm"),
    statusItem: boolean("status_item").notNull(),
    busca: text("busca").notNull(),
    embedding: vector("embedding", { dimensions: embeddingDimensions }),
  },
  (t) => [
    index("catmat_material_grupo").on(t.codigoGrupo),
    index("catmat_material_classe").on(t.codigoClasse),
    index("catmat_material_pdm").on(t.codigoPdm),
    index("catmat_material_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("catmat_material_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  ]
);
