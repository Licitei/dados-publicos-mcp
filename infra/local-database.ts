import { BunServices } from "@effect/platform-bun";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { isResolved } from "alchemy/Diff";
import type { PropsInput } from "alchemy/Input";
import * as Provider from "alchemy/Provider";
import { Resource, type ResourceClassLike } from "alchemy/Resource";
import { DbConfig, DbLayer } from "../src/kernel/db/client";
import { dataDirPath, ensureDataDir } from "../src/kernel/db/data-dir";
import { provisionSchema } from "../src/kernel/db/provision";
import {
  allDbTables,
  dbExtensions,
  schemaDdlText,
} from "../src/kernel/db/schema-registry";
import { McpProviders } from "./providers";

export const sha256Hex = (text: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  ).pipe(
    Effect.map((buffer) =>
      Arr.join(
        Arr.map(Arr.fromIterable(new Uint8Array(buffer)), (byte) =>
          Str.padStart(2, "0")(byte.toString(16))
        ),
        ""
      )
    )
  );

export const schemaDdl = () => schemaDdlText;

export const schemaHash = sha256Hex(schemaDdlText);

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

const LocalDatabaseResource = Resource<LocalDatabase>("Mcp.LocalDatabase");

export const LocalDatabaseClass: ResourceClassLike<LocalDatabase> =
  LocalDatabaseResource;

export const LocalDatabase: {
  (
    props: PropsInput<LocalDatabaseProps>
  ): (id: string) => Effect.Effect<LocalDatabase, never, McpProviders>;
  (
    id: string,
    props: PropsInput<LocalDatabaseProps>
  ): Effect.Effect<LocalDatabase, never, McpProviders>;
} = dual(
  2,
  (id: string, props: PropsInput<LocalDatabaseProps>) =>
    LocalDatabaseResource(id, props)
);

export const LocalDatabaseProvider = Provider.effect(
  LocalDatabaseResource,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const resolveDir = (override: string | undefined) =>
      Option.fromNullishOr(override).pipe(
        Option.match({
          onNone: () => ensureDataDir,
          onSome: (dir) =>
            fs.makeDirectory(dir, { recursive: true }).pipe(Effect.as(dir)),
        })
      );

    const provision = (props: LocalDatabaseProps) =>
      Effect.gen(function* () {
        const dataDir = yield* resolveDir(props.dataDir);
        const hash = yield* schemaHash;
        const context = yield* Layer.build(
          DbLayer.pipe(Layer.provide(Layer.succeed(DbConfig, { dataDir })))
        );
        yield* provisionSchema.pipe(Effect.provideContext(context));
        return {
          dataDir,
          tables: allDbTables.length,
          extensions: [...dbExtensions],
          schemaHash: hash,
        };
      }).pipe(Effect.scoped);

    return {
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, output }) {
        if (!isResolved(news) || output === undefined) return undefined;
        const dir = yield* Option.fromNullishOr(news.dataDir).pipe(
          Option.match({
            onNone: () => dataDirPath,
            onSome: (value) => Effect.succeed(value),
          })
        );
        const provisioned = yield* fs.exists(dir);
        const hash = yield* schemaHash;
        return !provisioned || output.schemaHash !== hash
          ? { action: "update" }
          : undefined;
      }),
      reconcile: Effect.fn(function* ({ news, output, session }) {
        yield* session.note(
          output === undefined
            ? "Provisionando o banco local (extensoes + DDL)."
            : "Reprovisionando o banco local (extensoes + DDL)."
        );
        return yield* provision(news);
      }),
      delete: Effect.fn(function* () {}),
    };
  })
).pipe(Layer.provide(BunServices.layer));

export const providers = Layer.effect(
  McpProviders,
  Provider.collection([LocalDatabaseResource])
).pipe(Layer.provide(LocalDatabaseProvider), Layer.orDie);
