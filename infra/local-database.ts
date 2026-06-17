import { existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Resource } from "alchemy/Resource";
import * as Provider from "alchemy/Provider";
import { isResolved } from "alchemy/Diff";
import { Db, DbConfig, DbLayer } from "../src/kernel/db/client";
import { tableDdl } from "../src/kernel/db/ddl";
import { allTables } from "./tables";
import { McpProviders } from "./providers";

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

const dataDirPath = (explicit?: string) =>
  explicit ?? process.env.DADOS_PUBLICOS_MCP_DATA_DIR ?? defaultBaseDir();

const resolveDataDir = (explicit?: string) => {
  const dir = dataDirPath(explicit);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const renderStatement = (statement: { queryChunks: ReadonlyArray<unknown> }) =>
  statement.queryChunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value;
      return Array.isArray(value) ? value.join("") : "";
    })
    .join("");

export const schemaDdl = () =>
  [
    ...extensions,
    ...allTables.flatMap((table) => tableDdl(table)).map(renderStatement),
  ].join("\n");

export const schemaHash = () =>
  createHash("sha256").update(schemaDdl()).digest("hex");

export type LocalDatabaseProps = {
  dataDir?: string;
};

export type LocalDatabaseAttributes = {
  dataDir: string;
  tables: number;
  extensions: readonly string[];
  schemaHash: string;
};

export type LocalDatabase = Resource<
  "Mcp.LocalDatabase",
  LocalDatabaseProps,
  LocalDatabaseAttributes,
  never,
  McpProviders
>;

export const LocalDatabase = Resource<LocalDatabase>("Mcp.LocalDatabase");

const provision = (props: LocalDatabaseProps) => {
  const dataDir = resolveDataDir(props.dataDir);
  const hash = schemaHash();
  return Effect.gen(function* () {
    const db = yield* Db;
    yield* Effect.forEach(
      allTables,
      (table) =>
        Effect.forEach(tableDdl(table), (statement) => db.execute(statement), {
          discard: true,
        }),
      { discard: true }
    );
    return {
      dataDir,
      tables: allTables.length,
      extensions,
      schemaHash: hash,
    };
  }).pipe(
    Effect.provide(
      DbLayer.pipe(Layer.provide(Layer.succeed(DbConfig, { dataDir })))
    ),
    Effect.scoped
  );
};

export const LocalDatabaseProvider = () =>
  Provider.effect(
    LocalDatabase,
    Effect.gen(function* () {
      return {
        list: () => Effect.succeed([]),
        diff: Effect.fn(function* ({ news, output }) {
          if (!isResolved(news)) return undefined;
          if (!output) return undefined;
          const provisioned = existsSync(dataDirPath(news.dataDir));
          return !provisioned || output.schemaHash !== schemaHash()
            ? { action: "update" }
            : undefined;
        }),
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
  Layer.effect(McpProviders, Provider.collection([LocalDatabase])).pipe(
    Layer.provide(LocalDatabaseProvider()),
    Layer.orDie
  );
