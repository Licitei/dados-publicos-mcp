import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Resource } from "alchemy/Resource";
import * as Provider from "alchemy/Provider";
import { Db, DbConfig, DbLayer } from "../src/kernel/db/client";
import { tableDdl } from "../src/kernel/db/ddl";
import { allTables } from "./tables";

export const extensions: readonly string[] = [
  "vector",
  "pg_textsearch",
  "ltree",
  "pg_trgm",
];

const appDirName = "dados-publicos-mcp";

const defaultBaseDir = () => {
  const home = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(home, appDirName);
};

const resolveDataDir = (explicit?: string) => {
  const dir =
    explicit ?? process.env.DADOS_PUBLICOS_MCP_DATA_DIR ?? defaultBaseDir();
  mkdirSync(dir, { recursive: true });
  return dir;
};

export type LocalDatabaseProps = {
  dataDir?: string;
};

export type LocalDatabase = Resource<
  "Mcp.LocalDatabase",
  LocalDatabaseProps,
  {
    dataDir: string;
    tables: number;
    extensions: readonly string[];
  },
  never,
  Providers
>;

export const LocalDatabase = Resource<LocalDatabase>("Mcp.LocalDatabase");

const provision = (props: LocalDatabaseProps) => {
  const dataDir = resolveDataDir(props.dataDir);
  return Effect.gen(function* () {
    const db = yield* Db;
    yield* Effect.forEach(
      allTables,
      (table) =>
        Effect.forEach(
          tableDdl(table),
          (statement) => db.execute(statement),
          { discard: true }
        ),
      { discard: true }
    );
    return {
      dataDir,
      tables: allTables.length,
      extensions,
    };
  }).pipe(
    Effect.provide(DbLayer.pipe(Layer.provide(Layer.succeed(DbConfig, { dataDir })))),
    Effect.scoped
  );
};

export class Providers extends Provider.ProviderCollection<Providers>()(
  "Mcp"
) {}

export const LocalDatabaseProvider = () =>
  Provider.effect(
    LocalDatabase,
    Effect.gen(function* () {
      return {
        list: () => Effect.succeed([]),
        reconcile: Effect.fn(function* ({ news, output, session }) {
          yield* session.note(
            output
              ? "Reprovisionando o banco local (extensoes + DDL)."
              : "Provisionando o banco local (extensoes + DDL)."
          );
          return yield* provision(news);
        }),
        delete: Effect.fn(function* () {}),
      };
    })
  );

export const providers = () =>
  Layer.effect(Providers, Provider.collection([LocalDatabase])).pipe(
    Layer.provide(LocalDatabaseProvider()),
    Layer.orDie
  );
