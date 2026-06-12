import { Effect, Match } from "effect";
import { is, sql } from "drizzle-orm";
import {
  customType,
  getTableConfig,
  index,
  IndexedColumn,
  integer,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core";
import { Db } from "../../kernel/db/client";
import { embeddingDimensions } from "../../kernel/embed/embedder";

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
    index("legislacao_node_gist").using("gist", t.path.asc()),
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

export type NodeRow = typeof node.$inferInsert;

const createTable = sql`create table if not exists ${node} (
  path ltree primary key,
  norma_id text not null,
  parent_path ltree,
  kind text not null,
  label text not null,
  heading text not null,
  text text not null,
  summary text not null,
  position integer not null,
  embedding vector(${sql.raw(String(embeddingDimensions))})
)`;

const opClass = (column: IndexedColumn) =>
  Match.value(column.indexConfig.opClass).pipe(
    Match.when(Match.string, (name) => sql` ${sql.raw(name)}`),
    Match.orElse(() => sql``)
  );

const withClause = (options: Record<string, unknown> | undefined) =>
  Match.value(options).pipe(
    Match.when(Match.record, (record) =>
      sql` with (${sql.raw(
        Object.entries(record)
          .map(([key, value]) => `${key}='${String(value)}'`)
          .join(", ")
      )})`
    ),
    Match.orElse(() => sql``)
  );

const isIndexedColumn = (column: unknown): column is IndexedColumn =>
  is(column, IndexedColumn);

const indexColumn = (column: unknown) =>
  Match.value(column).pipe(
    Match.when(isIndexedColumn, (indexed) =>
      sql`${sql.raw(indexed.name)}${opClass(indexed)}`
    ),
    Match.orElse(() => sql``)
  );

const createIndexes = getTableConfig(node).indexes.map((definition) =>
  sql`create index if not exists ${sql.raw(definition.config.name ?? "")}
    on ${node}
    using ${sql.raw(definition.config.method ?? "btree")}
    (${sql.join(definition.config.columns.map(indexColumn), sql`, `)})
    ${withClause(definition.config.with)}`
);

const schema = [createTable, ...createIndexes];

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(schema, (statement) => db.execute(statement), {
    discard: true,
  });
});

export const replaceNorma = (normaId: string, rows: readonly NodeRow[]) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.execute(sql`delete from ${node} where norma_id = ${normaId}`);
    yield* Match.value(rows.length).pipe(
      Match.when(0, () => Effect.void),
      Match.orElse(() => db.insert(node).values([...rows]))
    );
  });
