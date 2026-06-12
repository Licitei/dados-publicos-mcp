import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { DbLayer, query } from "../src/kernel/db/client";

const items = pgTable("items", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

describe("kernel/db", () => {
  it.effect("round-trips an insert and select through drizzle", () =>
    Effect.gen(function* () {
      yield* query((db) =>
        db.execute(
          sql`create table items (id integer primary key, name text not null)`
        )
      );
      yield* query((db) => db.insert(items).values({ id: 1, name: "licitacao" }));
      const rows = yield* query((db) =>
        db.select().from(items).where(eq(items.id, 1))
      );

      expect(rows).toEqual([{ id: 1, name: "licitacao" }]);
    }).pipe(Effect.provide(DbLayer))
  );

  it.effect("maps a failing query to DbError", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        query((db) => db.execute(sql`select * from does_not_exist`))
      );

      expect(error.code).toBe("db.QUERY");
      expect(error.message).toBe("Falha ao consultar o índice local.");
    }).pipe(Effect.provide(DbLayer))
  );

  it.effect("isolates state across layer instances", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        query((db) => db.select().from(items))
      );

      expect(error.code).toBe("db.QUERY");
    }).pipe(Effect.provide(DbLayer))
  );
});
