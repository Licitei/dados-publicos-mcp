import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_textsearch } from "@electric-sql/pglite/pg_textsearch";
import { ltree } from "@electric-sql/pglite/contrib/ltree";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import * as Pg from "@effect/sql-pg/PgClient";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { sql } from "drizzle-orm";

const extensions = ["vector", "pg_textsearch", "ltree"];

const socketPort = 5432;
const socketFile = `.s.PGSQL.${socketPort}`;

export class DbError extends Schema.TaggedErrorClass<DbError>()("DbError", {
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    return "Falha ao abrir o banco local.";
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

export class Db extends Context.Service<Db, PgDrizzle.EffectPgDatabase>()(
  "dados-publicos-mcp/Db"
) {}

export const DbLayer = Layer.effect(Db)(
  Effect.gen(function* () {
    const cfg = yield* DbConfig;
    const { dir } = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const pglite = await PGlite.create({
            dataDir: cfg.dataDir,
            extensions: { vector, pg_textsearch, ltree },
          });
          const dir = await mkdtemp(join(tmpdir(), "dados-publicos-mcp-"));
          const server = new PGLiteSocketServer({
            db: pglite,
            path: join(dir, socketFile),
          });
          await server.start();
          return { pglite, server, dir };
        },
        catch: (cause) => new DbError({ cause: String(cause) }),
      }),
      ({ pglite, server }) =>
        Effect.promise(async () => {
          await server.stop();
          await pglite.close();
        })
    );

    const client = yield* Pg.make({
      host: dir,
      port: socketPort,
      database: "template1",
      maxConnections: 1,
    });

    const db = yield* PgDrizzle.make().pipe(
      Effect.provideService(Pg.PgClient, client),
      Effect.provide(PgDrizzle.DefaultServices)
    );

    yield* Effect.forEach(
      extensions,
      (name) =>
        db.execute(sql`create extension if not exists ${sql.identifier(name)}`),
      { discard: true }
    );

    return db;
  }).pipe(Effect.provide(Reactivity.layer))
);
