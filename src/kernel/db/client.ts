import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { BunServices } from "@effect/platform-bun";
import * as Reactivity from "effect/reactivity/Reactivity";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { pg_textsearch } from "@electric-sql/pglite/pg_textsearch";
import { ltree } from "@electric-sql/pglite/contrib/ltree";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import * as Pg from "@effect/sql-pg/PgClient";
import * as PgTypes from "@effect/sql-pg/PgTypes";
import * as Result from "effect/Result";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { relations } from "./relations";

const DbErrorCode = Schema.Literals(["db.OPEN", "db.CONNECT", "db.DRIVER", "db.QUERY"]);
export type DbErrorCode = (typeof DbErrorCode)["Type"];

export class DbError extends Schema.TaggedError<DbError, { readonly brand: unique symbol }>()("DbError", {
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
      case "db.QUERY":
        return "Falha ao consultar o banco local.";
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

const socketPort = 5432;
const socketFile = `.s.PGSQL.${socketPort}`;

const ltreeCodec: PgTypes.Codec<string> = {
  encode: (value) => Result.succeed(new TextEncoder().encode(`\u0001${value}`)),
  decode: (bytes) => Result.succeed(new TextDecoder().decode(bytes.subarray(1))),
};

const makeDb = Effect.gen(function* () {
  const cfg = yield* DbConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const socketDir = yield* fs.makeTempDirectoryScoped({ prefix: "dados-publicos-mcp-" }).pipe(
    Effect.mapError((cause) =>
      DbError.make({ code: "db.OPEN", cause: String(cause) })
    )
  );

  const pglite = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        PGlite.create({
          ...(cfg.dataDir === undefined ? {} : { dataDir: cfg.dataDir }),
          extensions: { vector, pg_textsearch, ltree, pg_trgm },
        }),
      catch: (cause) =>
        DbError.make({ code: "db.OPEN", cause: String(cause) }),
    }),
    (instance) => Effect.promise(() => instance.close())
  );

  yield* Effect.tryPromise({
    try: () => pglite.exec("create extension if not exists ltree"),
    catch: (cause) => DbError.make({ code: "db.OPEN", cause: String(cause) }),
  });

  const found = yield* Effect.tryPromise({
    try: () =>
      pglite.query<{ oid: number }>(
        "select oid::int as oid from pg_type where typname = 'ltree'"
      ),
    catch: (cause) => DbError.make({ code: "db.OPEN", cause: String(cause) }),
  });

  const ltreeOid = yield* pipe(
    Effect.fromOption(Arr.head(found.rows)),
    Effect.mapBoth({
      onSuccess: (row) => row.oid,
      onFailure: () =>
        DbError.make({ code: "db.OPEN", cause: "ltree type not found" }),
    })
  );

  yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => {
        const server = new PGLiteSocketServer({
          db: pglite,
          path: path.join(socketDir, socketFile),
        });
        return server.start().then(() => server);
      },
      catch: (cause) =>
        DbError.make({ code: "db.OPEN", cause: String(cause) }),
    }),
    (server) => Effect.promise(() => server.stop())
  );

  const types = PgTypes.makeRegistry();
  types.register(ltreeOid, ltreeCodec);

  const client = yield* Pg.make({
    types,
    prepare: false,
    host: socketDir,
    port: socketPort,
    database: "template1",
    maxConnections: 1,
  }).pipe(
    Effect.mapError((cause) =>
      DbError.make({ code: "db.CONNECT", cause: String(cause) })
    )
  );

  const services = yield* Layer.build(PgDrizzle.DefaultServices);

  return yield* PgDrizzle.make({ relations }).pipe(
    Effect.provideService(Pg.PgClient, client),
    Effect.provideContext(services),
    Effect.map((db): PgDrizzle.EffectPgDatabase<typeof relations> => db)
  );
});

export class Db extends Context.Service<Db, Effect.Success<typeof makeDb>>()(
  "dados-publicos-mcp/kernel/db/client/Db"
) {}

export const DbLayer = Layer.effect(Db)(makeDb).pipe(
  Layer.provide(Reactivity.layer),
  Layer.provide(BunServices.layer)
);
