import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Path from "effect/Path";
import * as Str from "effect/String";
import { BunServices } from "@effect/platform-bun";
import { FileFinder } from "@ff-labs/fff-node";
import { dataDirPath } from "../data-dir";

const FuzzyErrorCode = Schema.Literals(["fuzzy.WRITE", "fuzzy.OPEN", "fuzzy.QUERY"]);
type FuzzyErrorCode = (typeof FuzzyErrorCode)["Type"];

class FuzzyError extends Schema.TaggedError<FuzzyError, { readonly brand: unique symbol }>()(
  "FuzzyError",
  {
    code: FuzzyErrorCode,
    indice: Schema.String,
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "fuzzy.WRITE":
        return `Falha ao gravar o indice aproximado de ${this.indice}.`;
      case "fuzzy.OPEN":
        return `Falha ao abrir o indice aproximado de ${this.indice}.`;
      case "fuzzy.QUERY":
        return `Falha na busca aproximada em ${this.indice}.`;
    }
  }
}

export const FuzzyConfig = Context.Reference<{ readonly dir: Option.Option<string> }>(
  "dados-publicos-mcp/kernel/search/fuzzy/FuzzyConfig",
  { defaultValue: () => ({ dir: Option.none() }) }
);

type FuzzyRow = readonly [id: string | number, text: string];

const rowsFile = "rows.tsv";

const flatten = (text: string) => pipe(text, Str.replace(/[\t\r\n]+/g, " "), Str.trim);

const idOf = (line: string) => pipe(Str.split(line, "\t"), Arr.head, Option.filter(Str.isNonEmpty));

const makeFuzzy = Effect.gen(function* () {
  const cfg = yield* FuzzyConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const base = yield* Option.match(cfg.dir, {
    onNone: () =>
      dataDirPath.pipe(
        Effect.mapBoth({
          onSuccess: (dir) => path.join(dir, "fuzzy"),
          onFailure: (cause) =>
            FuzzyError.make({ code: "fuzzy.OPEN", indice: "*", cause: cause.message }),
        })
      ),
    onSome: Effect.succeed,
  });
  const finders = MutableHashMap.empty<string, FileFinder>();

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => MutableHashMap.forEach(finders, (finder) => finder.destroy()))
  );

  const dirOf = (name: string) => path.join(base, name);

  const evict = (name: string) =>
    Effect.sync(() =>
      Option.map(MutableHashMap.get(finders, name), (finder) => {
        finder.destroy();
        MutableHashMap.remove(finders, name);
      })
    );

  const write = (name: string, rows: Iterable<FuzzyRow>) =>
    Effect.gen(function* () {
      const dir = dirOf(name);
      yield* evict(name);
      yield* fs.makeDirectory(dir, { recursive: true });
      const body = pipe(
        Arr.fromIterable(rows),
        Arr.map(([id, text]): readonly [string | number, string] => [id, flatten(text)]),
        Arr.filter(([, text]) => Str.isNonEmpty(text)),
        Arr.map(([id, text]) => `${id}\t${text}`),
        Arr.join("\n")
      );
      yield* fs.writeFileString(path.join(dir, rowsFile), `${body}\n`);
    }).pipe(
      Effect.mapError((cause) =>
        FuzzyError.make({ code: "fuzzy.WRITE", indice: name, cause: String(cause) })
      )
    );

  const finderOf = (name: string) =>
    Option.match(MutableHashMap.get(finders, name), {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.gen(function* () {
          const created = FileFinder.create({
            basePath: dirOf(name),
            aiMode: true,
            disableWatch: true,
          });
          const finder = yield* created.ok
            ? Effect.succeed(created.value)
            : Effect.fail(
                FuzzyError.make({ code: "fuzzy.OPEN", indice: name, cause: created.error })
              );
          yield* Effect.promise(() => finder.waitForScan(60_000));
          MutableHashMap.set(finders, name, finder);
          return finder;
        }),
    });

  const match = (name: string, query: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const present = yield* fs
        .exists(path.join(dirOf(name), rowsFile))
        .pipe(Effect.orElseSucceed(() => false));
      const limit = options?.limit ?? 10;
      return present
        ? yield* finderOf(name).pipe(
            Effect.flatMap((finder) => {
              const found = finder.grep(query, {
                mode: "fuzzy",
                pageSize: limit,
                maxMatchesPerFile: limit,
              });
              return found.ok
                ? Effect.succeed(
                    Arr.getSomes(Arr.map(found.value.items, (item) => idOf(item.lineContent)))
                  )
                : Effect.fail(
                    FuzzyError.make({ code: "fuzzy.QUERY", indice: name, cause: found.error })
                  );
            })
          )
        : [];
    });

  const exists = (name: string) =>
    fs
      .exists(path.join(dirOf(name), rowsFile))
      .pipe(
        Effect.mapError((cause) =>
          FuzzyError.make({ code: "fuzzy.OPEN", indice: name, cause: String(cause) })
        )
      );

  return { write, match, exists };
});

export class Fuzzy extends Context.Service<Fuzzy, Effect.Success<typeof makeFuzzy>>()(
  "dados-publicos-mcp/kernel/search/fuzzy"
) {}

export const FuzzyLive = Layer.effect(Fuzzy)(makeFuzzy).pipe(Layer.provide(BunServices.layer));
