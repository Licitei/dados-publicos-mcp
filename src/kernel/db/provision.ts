import { Effect } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "./client";
import { tableDdl } from "./ddl";
import { allDbTables, dbExtensions } from "./schema-registry";

export const provisionExtensions = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    dbExtensions,
    (name) =>
      db.execute(sql`create extension if not exists ${sql.identifier(name)}`),
    { discard: true }
  );
});

export const provisionSchema = Effect.gen(function* () {
  yield* provisionExtensions;
  const db = yield* Db;
  yield* Effect.forEach(
    allDbTables,
    (table) =>
      Effect.forEach(tableDdl(table), (statement) => db.execute(statement), {
        discard: true,
      }),
    { discard: true }
  );
});
