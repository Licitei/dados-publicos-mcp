import { Context, Effect, Layer, Schema } from "effect";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_textsearch } from "@electric-sql/pglite/pg_textsearch";
import { ltree } from "@electric-sql/pglite/contrib/ltree";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

const extensions = ["vector", "pg_textsearch", "ltree"];

const DbErrorCode = Schema.Literals(["db.OPEN", "db.QUERY", "db.MIGRATE"]);
export type DbErrorCode = (typeof DbErrorCode)["Type"];

export class DbError extends Schema.TaggedErrorClass<DbError>()("DbError", {
  code: DbErrorCode,
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "db.OPEN":
        return "Falha ao abrir o banco local.";
      case "db.QUERY":
        return "Falha ao consultar o índice local.";
      case "db.MIGRATE":
        return "Falha ao aplicar as migrações do índice local.";
    }
  }
}

const DbConfigSchema = Schema.Struct({
  dataDir: Schema.optional(Schema.String),
});
export type DbConfig = (typeof DbConfigSchema)["Type"];

export const DbConfig = Context.Reference<DbConfig>(
  "dados-publicos-mcp/DbConfig",
  {
    defaultValue: () => ({}),
  }
);

type DbHandle = ReturnType<typeof drizzle>;

export class Db extends Context.Service<Db, DbHandle>()(
  "dados-publicos-mcp/Db"
) {}

export const DbLayer = Layer.effect(Db)(
  Effect.gen(function* () {
    const cfg = yield* DbConfig;
    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          PGlite.create({
            dataDir: cfg.dataDir,
            extensions: { vector, pg_textsearch, ltree },
          }),
        catch: (cause) => new DbError({ code: "db.OPEN", cause: String(cause) }),
      }),
      (instance) => Effect.promise(() => instance.close())
    );

    const db = drizzle({ client });

    yield* Effect.tryPromise({
      try: () =>
        extensions.reduce(
          (acc, name) =>
            acc.then(() =>
              db.execute(sql`create extension if not exists ${sql.identifier(name)}`)
            ),
          Promise.resolve<unknown>(undefined)
        ),
      catch: (cause) => new DbError({ code: "db.OPEN", cause: String(cause) }),
    });

    return db;
  })
);

export const query = <A>(run: (db: DbHandle) => Promise<A>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    return yield* Effect.tryPromise({
      try: () => run(db),
      catch: (cause) => new DbError({ code: "db.QUERY", cause: String(cause) }),
    });
  });
