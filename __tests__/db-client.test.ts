import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { Db, DbLayer } from "../src/kernel/db/client";

const items = pgTable("items", {
  id: integer().primaryKey(),
  name: text().notNull(),
});

describe("kernel/db", () => {
  test("round-trips an insert and select through effect-postgres drizzle", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.execute(
          sql`create table items (id integer primary key, name text not null)`
        );
        yield* db.insert(items).values({ id: 1, name: "licitacao" });
        return yield* db.select().from(items).where(eq(items.id, 1));
      }).pipe(Effect.provide(DbLayer))
    );

    expect(rows).toEqual([{ id: 1, name: "licitacao" }]);
  });

  test("a failing query surfaces a drizzle query error in the error channel", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Db;
        return yield* db.execute(sql`select * from does_not_exist`);
      }).pipe(Effect.flip, Effect.provide(DbLayer))
    );

    expect(error._tag).toBe("EffectDrizzleQueryError");
  });

  test("loads pgvector and exposes cosine distance", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Db;
        return yield* db.execute(
          sql`select '[1,0,0]'::vector <=> '[0,1,0]'::vector as distance`
        );
      }).pipe(Effect.provide(DbLayer))
    );

    expect(Number(rows[0].distance)).toBeCloseTo(1);
  });

  test("loads ltree and resolves subtree ancestry", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.execute(sql`create table tree (id integer primary key, path ltree)`);
        yield* db.execute(sql`insert into tree values
          (1, 'l14133'), (2, 'l14133.t2'), (3, 'l14133.t2.art17'), (4, 'l8666')`);
        return yield* db.execute(
          sql`select id from tree where path <@ 'l14133.t2' order by id`
        );
      }).pipe(Effect.provide(DbLayer))
    );

    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });

  test("loads pg_textsearch and ranks a bm25 match in pt-BR", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.execute(sql`create table docs (id integer primary key, body text)`);
        yield* db.execute(sql`insert into docs values
          (1, 'lei de licitacoes e contratos publicos'),
          (2, 'codigo de transito brasileiro'),
          (3, 'licitacoes na nova lei de licitacoes')`);
        yield* db.execute(
          sql`create index docs_bm25 on docs using bm25 (body) with (text_config='portuguese')`
        );
        return yield* db.execute(
          sql`select id from docs order by body <@> to_bm25query('licitacoes') limit 2`
        );
      }).pipe(Effect.provide(DbLayer))
    );

    expect(rows.map((r) => r.id)).toEqual([3, 1]);
  });
});
