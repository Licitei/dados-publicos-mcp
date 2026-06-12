import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { DbLayer, query } from "../src/kernel/db/client";

const items = pgTable("items", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

describe("kernel/db", () => {
  test("round-trips an insert and select through drizzle", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        yield* query((db) =>
          db.execute(
            sql`create table items (id integer primary key, name text not null)`
          )
        );
        yield* query((db) =>
          db.insert(items).values({ id: 1, name: "licitacao" })
        );
        return yield* query((db) =>
          db.select().from(items).where(eq(items.id, 1))
        );
      }).pipe(Effect.provide(DbLayer))
    );

    expect(rows).toEqual([{ id: 1, name: "licitacao" }]);
  });

  test("maps a failing query to DbError", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        query((db) => db.execute(sql`select * from does_not_exist`))
      ).pipe(Effect.provide(DbLayer))
    );

    expect(error.code).toBe("db.QUERY");
    expect(error.message).toBe("Falha ao consultar o índice local.");
  });

  test("isolates state across layer instances", async () => {
    const error = await Effect.runPromise(
      Effect.flip(query((db) => db.select().from(items))).pipe(
        Effect.provide(DbLayer)
      )
    );

    expect(error.code).toBe("db.QUERY");
  });

  test("loads pgvector and exposes cosine distance", async () => {
    const rows = await Effect.runPromise(
      query((db) =>
        db.execute(
          sql`select '[1,0,0]'::vector <=> '[0,1,0]'::vector as distance`
        )
      ).pipe(Effect.provide(DbLayer))
    );

    expect(Number(rows.rows[0].distance)).toBeCloseTo(1);
  });

  test("loads pg_textsearch and ranks a bm25 match in pt-BR", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        yield* query((db) =>
          db.execute(sql`create table docs (id integer primary key, body text)`)
        );
        yield* query((db) =>
          db.execute(sql`insert into docs values
            (1, 'lei de licitacoes e contratos publicos'),
            (2, 'codigo de transito brasileiro'),
            (3, 'licitacoes na nova lei de licitacoes')`)
        );
        yield* query((db) =>
          db.execute(
            sql`create index docs_bm25 on docs using bm25 (body) with (text_config='portuguese')`
          )
        );
        return yield* query((db) =>
          db.execute(
            sql`select id from docs order by body <@> to_bm25query('licitacoes') limit 2`
          )
        );
      }).pipe(Effect.provide(DbLayer))
    );

    expect(rows.rows.map((r) => r.id)).toEqual([3, 1]);
  });
});
