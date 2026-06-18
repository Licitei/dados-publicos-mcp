import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { Db } from "../../src/kernel/db/client";
import { TestDbLive } from "./support/test-db";

const items = pgTable("items", {
  id: integer().primaryKey(),
  name: text().notNull(),
});

describe("kernel/db", () => {
  it.effect(
    "round-trips an insert and select through effect-postgres drizzle",
    () =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.execute(
          sql`create table items (id integer primary key, name text not null)`
        );
        yield* db.insert(items).values({ id: 1, name: "licitacao" });
        const rows = yield* db.select().from(items).where(eq(items.id, 1));
        expect(rows).toEqual([{ id: 1, name: "licitacao" }]);
      }).pipe(Effect.provide(TestDbLive)),
    30_000
  );

  it.effect(
    "a failing query surfaces a drizzle query error in the error channel",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const db = yield* Db;
            return yield* db.execute(sql`select * from does_not_exist`);
          })
        );
        expect(error._tag).toBe("EffectDrizzleQueryError");
      }).pipe(Effect.provide(TestDbLive)),
    30_000
  );

  it.effect(
    "loads pgvector and exposes cosine distance",
    () =>
      Effect.gen(function* () {
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select '[1,0,0]'::vector <=> '[0,1,0]'::vector as distance`
        );
        expect(Number(rows[0].distance)).toBeCloseTo(1);
      }).pipe(Effect.provide(TestDbLive)),
    30_000
  );

  it.effect(
    "loads ltree and resolves subtree ancestry",
    () =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.execute(sql`create table tree (id integer primary key, path ltree)`);
        yield* db.execute(sql`insert into tree values
          (1, 'l14133'), (2, 'l14133.t2'), (3, 'l14133.t2.art17'), (4, 'l8666')`);
        const rows = yield* db.execute(
          sql`select id from tree where path <@ 'l14133.t2' order by id`
        );
        expect(rows.map((r) => r.id)).toEqual([2, 3]);
      }).pipe(Effect.provide(TestDbLive)),
    30_000
  );

  it.effect(
    "loads pg_textsearch and ranks a bm25 match in pt-BR",
    () =>
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
        const rows = yield* db.execute(
          sql`select id from docs order by body <@> to_bm25query('licitacoes') limit 2`
        );
        expect(rows.map((r) => r.id)).toEqual([3, 1]);
      }).pipe(Effect.provide(TestDbLive)),
    30_000
  );
});
