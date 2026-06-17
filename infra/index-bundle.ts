import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Resource } from "alchemy/Resource";
import * as Provider from "alchemy/Provider";
import { isResolved } from "alchemy/Diff";

export type IndexBundleProps = {
  src: string;
  dest: string;
};

export type IndexBundleAttributes = {
  src: string;
  dest: string;
  files: number;
  bytes: number;
};

export type IndexBundle = Resource<
  "Mcp.IndexBundle",
  IndexBundleProps,
  IndexBundleAttributes,
  never,
  Providers
>;

export const IndexBundle = Resource<IndexBundle>("Mcp.IndexBundle");

const measure = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(root, { recursive: true });
    const stats = yield* Effect.forEach(
      entries,
      (name) => fs.stat(path.join(root, name)),
      { concurrency: 2 }
    );
    const regular = stats.filter((info) => info.type === "File");
    return {
      files: regular.length,
      bytes: regular.reduce((sum, info) => sum + Number(info.size), 0),
    };
  });

const snapshot = (props: IndexBundleProps) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const src = path.resolve(process.cwd(), props.src);
    const dest = path.resolve(process.cwd(), props.dest);
    yield* fs.remove(dest, { recursive: true, force: true });
    yield* fs.makeDirectory(path.dirname(dest), { recursive: true });
    yield* fs.copy(src, dest, { overwrite: true });
    const { files, bytes } = yield* measure(dest);
    return { src, dest, files, bytes };
  });

export class Providers extends Provider.ProviderCollection<Providers>()(
  "McpBundle"
) {}

export const IndexBundleProvider = () =>
  Provider.effect(
    IndexBundle,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return {
        list: () => Effect.succeed([]),
        diff: Effect.fn(function* ({ news }) {
          return isResolved(news) ? { action: "update" } : undefined;
        }),
        reconcile: Effect.fn(function* ({ news, output, session }) {
          yield* session.note(
            output
              ? "Reempacotando os indices locais para distribuicao."
              : "Empacotando os indices locais para distribuicao."
          );
          return yield* snapshot(news);
        }),
        delete: Effect.fn(function* ({ output }) {
          if (!output) return;
          yield* fs.remove(output.dest, { recursive: true, force: true });
        }),
      };
    })
  );

export const providers = () =>
  Layer.effect(Providers, Provider.collection([IndexBundle])).pipe(
    Layer.provide(IndexBundleProvider()),
    Layer.orDie
  );
