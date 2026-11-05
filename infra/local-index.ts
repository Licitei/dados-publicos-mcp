import { dual } from "effect/Function";
import * as Arr from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Predicate from "effect/Predicate";
import * as Rec from "effect/Record";
import * as Schema from "effect/Schema";
import { isResolved } from "alchemy/Diff";
import type { PropsInput } from "alchemy/Input";
import * as Provider from "alchemy/Provider";
import { Resource, type ResourceClassLike } from "alchemy/Resource";
import {
  type FonteKey,
  type IndexEntry,
  type IndexFailure,
  type Scope,
} from "../src/serve/index-registry";
import { sha256Hex, tablesHash } from "./schema-hash";
import { McpProviders } from "./providers";

const ScopeKey = Schema.fromJsonString(
  Schema.Struct({
    ufs: Schema.String.pipe(Schema.Array, Schema.NullOr),
    anos: Schema.Finite.pipe(Schema.Array, Schema.NullOr),
    mes: Schema.NullOr(Schema.String),
  })
);

const scopeHash = (scope: Scope | undefined) =>
  Schema.encodeEffect(ScopeKey)({
    ufs: scope?.ufs ?? null,
    anos: scope?.anos ?? null,
    mes: scope?.mes ?? null,
  }).pipe(Effect.orDie, Effect.flatMap(sha256Hex));

export type LocalIndexProps = {
  fonte: FonteKey;
  scope?: Scope;
};

type LocalIndexAttributes = {
  fonte: FonteKey;
  rows: number;
  version: string | null;
  indexedAt: string;
  scopeHash: string;
  schemaHash: string;
};

export type LocalIndex = Resource<
  "Mcp.LocalIndex",
  LocalIndexProps,
  LocalIndexAttributes,
  never,
  McpProviders
>;

const LocalIndexResource = Resource<LocalIndex>("Mcp.LocalIndex");

export const LocalIndexClass: ResourceClassLike<LocalIndex> = LocalIndexResource;

export const LocalIndex: {
  (
    props: PropsInput<LocalIndexProps>
  ): (id: string) => Effect.Effect<LocalIndex, never, McpProviders>;
  (id: string, props: PropsInput<LocalIndexProps>): Effect.Effect<LocalIndex, never, McpProviders>;
} = dual(2, (id: string, props: PropsInput<LocalIndexProps>) => LocalIndexResource(id, props));

type IndexRegistry = Record<FonteKey, IndexEntry>;

type RunIndex = (entry: IndexEntry, scope: Scope) => Effect.Effect<unknown, IndexFailure>;

type ProbeVersion = (entry: IndexEntry) => Effect.Effect<string | null, IndexFailure>;

export type LocalIndexConfig = {
  registry: IndexRegistry;
  run: RunIndex;
  version: ProbeVersion;
};

const sumNumbers = (values: ReadonlyArray<unknown>): number =>
  Arr.reduce(values, 0, (total, value) => (Predicate.isNumber(value) ? total + value : total));

const toRows = (summary: unknown): number =>
  Match.value(summary).pipe(
    Match.when(Predicate.isNumber, (value) => value),
    Match.when(Arr.isArray, sumNumbers),
    Match.when(Predicate.isObject, (record) => sumNumbers(Rec.values(record))),
    Match.orElse(() => 0)
  );

const provision = (config: LocalIndexConfig, props: LocalIndexProps) =>
  Effect.gen(function* () {
    const entry = config.registry[props.fonte];
    const version = yield* config.version(entry);
    const summary = yield* config.run(entry, props.scope ?? {});
    const indexedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
    return {
      fonte: props.fonte,
      rows: toRows(summary),
      version,
      indexedAt,
      scopeHash: yield* scopeHash(props.scope),
      schemaHash: yield* tablesHash(entry.tables),
    };
  });

export const LocalIndexProvider = (config: LocalIndexConfig) =>
  Provider.effect(
    LocalIndexResource,
    Effect.succeed({
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news, output }) {
        if (!isResolved(news) || output === undefined) return undefined;
        const nextScope = yield* scopeHash(news.scope);
        const nextSchema = yield* tablesHash(config.registry[news.fonte].tables);
        const nextVersion = yield* config
          .version(config.registry[news.fonte])
          .pipe(Effect.orElseSucceed(() => output.version));
        return output.scopeHash !== nextScope ||
          output.schemaHash !== nextSchema ||
          nextVersion === null ||
          output.version !== nextVersion
          ? { action: "update" }
          : undefined;
      }),
      reconcile: Effect.fn(function* ({ news, output, session }) {
        yield* session.note(
          output === undefined
            ? `Indexando a fonte "${news.fonte}".`
            : `Reindexando a fonte "${news.fonte}".`
        );
        return yield* provision(config, news);
      }),
      delete: Effect.fn(function* () {}),
    })
  );

export const providers = (config: LocalIndexConfig) =>
  Layer.effect(McpProviders, Provider.collection([LocalIndexResource])).pipe(
    Layer.provide(LocalIndexProvider(config)),
    Layer.orDie
  );
