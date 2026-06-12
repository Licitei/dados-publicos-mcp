import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_textsearch } from "@electric-sql/pglite/pg_textsearch";
import { ltree } from "@electric-sql/pglite/contrib/ltree";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import * as Pg from "@effect/sql-pg/PgClient";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { sql } from "drizzle-orm";

const extensions = ["vector", "pg_textsearch", "ltree", "pg_trgm"];

const socketPort = 5432;
const socketFile = `.s.PGSQL.${socketPort}`;

const DbErrorCode = Schema.Literals([
  "db.OPEN",
  "db.CONNECT",
  "db.DRIVER",
  "db.EXTENSION",
]);
export type DbErrorCode = (typeof DbErrorCode)["Type"];

export class DbError extends Schema.TaggedErrorClass<DbError>()("DbError", {
  code: DbErrorCode,
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "db.OPEN":
        return "Falha ao abrir o banco local.";
      case "db.CONNECT":
        return "Falha ao conectar ao banco local.";
      case "db.DRIVER":
        return "Falha ao inicializar o driver do banco.";
      case "db.EXTENSION":
        return "Falha ao habilitar as extensoes do banco.";
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
            extensions: { vector, pg_textsearch, ltree, pg_trgm },
          });
          const dir = await mkdtemp(join(tmpdir(), "dados-publicos-mcp-"));
          const server = new PGLiteSocketServer({
            db: pglite,
            path: join(dir, socketFile),
          });
          await server.start();
          return { pglite, server, dir };
        },
        catch: (cause) => new DbError({ code: "db.OPEN", cause: String(cause) }),
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
    }).pipe(
      Effect.mapError(
        (cause) => new DbError({ code: "db.CONNECT", cause: String(cause) })
      )
    );

    const db = yield* PgDrizzle.make().pipe(
      Effect.provideService(Pg.PgClient, client),
      Effect.provide(PgDrizzle.DefaultServices),
      Effect.mapError(
        (cause) => new DbError({ code: "db.DRIVER", cause: String(cause) })
      )
    );

    yield* Effect.forEach(
      extensions,
      (name) =>
        db.execute(sql`create extension if not exists ${sql.identifier(name)}`),
      { discard: true }
    ).pipe(
      Effect.mapError(
        (cause) => new DbError({ code: "db.EXTENSION", cause: String(cause) })
      )
    );

    return db;
  }).pipe(Effect.provide(Reactivity.layer))
);
