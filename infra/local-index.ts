import { Exit } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Resource } from "alchemy/Resource";
import * as Provider from "alchemy/Provider";
import {
  type FonteKey,
  type IndexEntry,
  type Scope,
} from "../src/serve/index-registry";
import { McpProviders } from "./providers";

export type LocalIndexProps = {
  fonte: FonteKey;
  scope?: Scope;
};

export type LocalIndexAttributes = {
  fonte: FonteKey;
  rows: number;
};

export type LocalIndex = Resource<
  "Mcp.LocalIndex",
  LocalIndexProps,
  LocalIndexAttributes,
  never,
  McpProviders
>;

export const LocalIndex = Resource<LocalIndex>("Mcp.LocalIndex");

export type IndexRegistry = Record<FonteKey, IndexEntry>;

export type RunIndex = (
  entry: IndexEntry,
  scope: Scope
) => Promise<Exit.Exit<unknown, unknown>>;

export type LocalIndexConfig = {
  registry: IndexRegistry;
  run: RunIndex;
};

const sumNumbers = (values: readonly unknown[]): number =>
  values.reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0
  );

const toRows = (summary: unknown): number =>
  typeof summary === "number"
    ? summary
    : Array.isArray(summary)
      ? sumNumbers(summary)
      : summary !== null && typeof summary === "object"
        ? sumNumbers(Object.values(summary))
        : 0;

const provision = (config: LocalIndexConfig, props: LocalIndexProps) =>
  Effect.promise(() =>
    config.run(config.registry[props.fonte], props.scope ?? {})
  ).pipe(
    Effect.flatMap((exit) =>
      Exit.match(exit, {
        onSuccess: (summary) =>
          Effect.succeed({ fonte: props.fonte, rows: toRows(summary) }),
        onFailure: (cause) => Effect.failCause(cause),
      })
    )
  );

export const LocalIndexProvider = (config: LocalIndexConfig) =>
  Provider.effect(
    LocalIndex,
    Effect.gen(function* () {
      return {
        list: () => Effect.succeed([]),
        reconcile: Effect.fn(function* ({ news, output, session }) {
          yield* session.note(
            output
              ? `Reindexando a fonte "${news.fonte}".`
              : `Indexando a fonte "${news.fonte}".`
          );
          return yield* provision(config, news);
        }),
        delete: Effect.fn(function* () {}),
      };
    })
  );

export const providers = (config: LocalIndexConfig) =>
  Layer.effect(McpProviders, Provider.collection([LocalIndex])).pipe(
    Layer.provide(LocalIndexProvider(config)),
    Layer.orDie
  );
