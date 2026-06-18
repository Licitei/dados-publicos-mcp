import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FileSystem } from "effect/FileSystem";
import { Resource } from "alchemy/Resource";
import * as Provider from "alchemy/Provider";
import { isResolved } from "alchemy/Diff";
import { Db, DbConfig, DbLayer } from "../src/kernel/db/client";
import { dataDirPath, ensureDataDir } from "../src/kernel/db/data-dir";
import { provisionSchema } from "../src/kernel/db/provision";
import {
  allDbTables,
  dbExtensions,
  schemaDdlText,
} from "../src/kernel/db/schema-registry";
import { McpProviders } from "./providers";

export const schemaDdl = () => schemaDdlText;

export const schemaHash = () =>
  createHash("sha256").update(schemaDdlText).digest("hex");

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

const ensureDir = (dir: string) =>
  FileSystem.pipe(
    Effect.flatMap((fs) => fs.makeDirectory(dir, { recursive: true })),
    Effect.as(dir)
  );

const resolveDir = (override: string | undefined) =>
  override === undefined ? ensureDataDir : ensureDir(override);

const provision = (props: LocalDatabaseProps) =>
  resolveDir(props.dataDir).pipe(
    Effect.flatMap((dataDir) =>
      provisionSchema.pipe(
        Effect.as({
          dataDir,
          tables: allDbTables.length,
          extensions: [...dbExtensions],
          schemaHash: schemaHash(),
        }),
        Effect.provide(
          DbLayer.pipe(Layer.provide(Layer.succeed(DbConfig, { dataDir })))
        ),
        Effect.scoped
      )
    )
  );

export const LocalDatabaseProvider = () =>
  Provider.effect(
    LocalDatabase,
    Effect.gen(function* () {
      return {
        list: () => Effect.succeed([]),
        diff: Effect.fn(function* ({ news, output }) {
          if (!isResolved(news)) return undefined;
          if (!output) return undefined;
          const fs = yield* FileSystem;
          const dir =
            news.dataDir === undefined ? yield* dataDirPath : news.dataDir;
          const provisioned = yield* fs.exists(dir);
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
