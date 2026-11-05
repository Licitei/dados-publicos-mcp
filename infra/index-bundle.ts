import { BunServices } from "@effect/platform-bun";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { isResolved } from "alchemy/Diff";
import type { PropsInput } from "alchemy/Input";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";

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

export class Providers extends Provider.ProviderCollection<Providers>()(
  "McpBundle"
) {}

export type IndexBundle = Resource<
  "Mcp.IndexBundle",
  IndexBundleProps,
  IndexBundleAttributes,
  never,
  Providers
>;

const IndexBundleResource = Resource<IndexBundle>("Mcp.IndexBundle");

export const IndexBundle: {
  (
    props: PropsInput<IndexBundleProps>
  ): (id: string) => Effect.Effect<IndexBundle, never, Providers>;
  (
    id: string,
    props: PropsInput<IndexBundleProps>
  ): Effect.Effect<IndexBundle, never, Providers>;
} = dual(
  2,
  (id: string, props: PropsInput<IndexBundleProps>) =>
    IndexBundleResource(id, props)
);

const IndexBundleProvider = Provider.effect(
  IndexBundleResource,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const measure = (root: string) =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(root, { recursive: true });
        const stats = yield* Effect.forEach(
          entries,
          (name) => fs.stat(path.join(root, name)),
          { concurrency: 2 }
        );
        const regular = Arr.filter(stats, (info) => info.type === "File");
        return {
          files: regular.length,
          bytes: Arr.reduce(
            regular,
            0,
            (sum, info) => sum + Number(info.size)
          ),
        };
      });

    const snapshot = (props: IndexBundleProps) =>
      Effect.gen(function* () {
        const src = path.resolve(process.cwd(), props.src);
        const dest = path.resolve(process.cwd(), props.dest);
        yield* fs.remove(dest, { recursive: true, force: true });
        yield* fs.makeDirectory(path.dirname(dest), { recursive: true });
        yield* fs.copy(src, dest, { overwrite: true });
        const { files, bytes } = yield* measure(dest);
        return { src, dest, files, bytes };
      });

    return {
      list: () => Effect.succeed([]),
      diff: Effect.fn(function* ({ news }) {
        return isResolved(news) ? { action: "update" } : undefined;
      }),
      reconcile: Effect.fn(function* ({ news, output, session }) {
        yield* session.note(
          output === undefined
            ? "Empacotando os indices locais para distribuicao."
            : "Reempacotando os indices locais para distribuicao."
        );
        return yield* snapshot(news);
      }),
      delete: Effect.fn(function* ({ output }) {
        yield* Option.fromNullishOr(output).pipe(
          Option.match({
            onNone: () => Effect.void,
            onSome: (bundle) =>
              fs.remove(bundle.dest, { recursive: true, force: true }),
          })
        );
      }),
    };
  })
).pipe(Layer.provide(BunServices.layer));

export const providers = Layer.effect(
  Providers,
  Provider.collection([IndexBundleResource])
).pipe(Layer.provide(IndexBundleProvider), Layer.orDie);
