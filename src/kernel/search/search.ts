import { Context, Effect, Layer, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Path from "effect/Path";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { BunServices } from "@effect/platform-bun";
import { FileFinder } from "@ff-labs/fff-node";
import * as Scope from "effect/Scope";
import { CorpusName, corpusDir } from "./corpus";

const SearchErrorCode = Schema.Literals([
  "search.OPEN",
  "search.SCAN",
  "search.QUERY",
  "search.READ",
  "search.PATH",
]);
type SearchErrorCode = (typeof SearchErrorCode)["Type"];

class SearchError extends Schema.TaggedError<SearchError, { readonly brand: unique symbol }>()(
  "SearchError",
  {
    code: SearchErrorCode,
    corpus: CorpusName,
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "search.OPEN":
        return `Acervo ${this.corpus} indisponível. Rode \`dados-publicos-mcp index ${this.corpus}\` para baixá-lo.`;
      case "search.SCAN":
        return `Tempo esgotado ao indexar o acervo ${this.corpus}.`;
      case "search.QUERY":
        return `Falha ao buscar no acervo ${this.corpus}.`;
      case "search.READ":
        return `Documento não encontrado no acervo ${this.corpus}.`;
      case "search.PATH":
        return `Caminho inválido no acervo ${this.corpus}.`;
    }
  }
}

export const SearchConfig = Context.Reference<{
  readonly roots: Partial<Readonly<Record<CorpusName, string>>>;
  readonly scanTimeoutMs: number;
}>("dados-publicos-mcp/kernel/search/search/SearchConfig", {
  defaultValue: () => ({ roots: {}, scanTimeoutMs: 120_000 }),
});

const DocumentHit = Schema.Struct({
  path: Schema.String,
  score: Schema.Finite,
});
type DocumentHit = (typeof DocumentHit)["Type"];

const LineHit = Schema.Struct({
  path: Schema.String,
  line: Schema.Finite,
  text: Schema.String,
  before: Schema.Array(Schema.String),
  after: Schema.Array(Schema.String),
});
type LineHit = (typeof LineHit)["Type"];

const Document = Schema.Struct({
  path: Schema.String,
  meta: Schema.Record(Schema.String, Schema.String),
  body: Schema.String,
});
type Document = (typeof Document)["Type"];

const ignoredNames = ["README.md", "COBERTURA.md", "PENDENCIAS.md"];
const ignoredDirs = ["assets/", "scripts/", "tests/", "metadados/", ".github/"];

const isContent = (relativePath: string) =>
  Str.endsWith(".md")(relativePath) &&
  !Arr.some(ignoredNames, (name) => Str.endsWith(name)(relativePath)) &&
  !Arr.some(ignoredDirs, (dir) => Str.startsWith(dir)(relativePath));

const frontmatterLine = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/;

const unquote = (value: string) =>
  pipe(value, Str.trim, (trimmed) =>
    Str.startsWith('"')(trimmed) && Str.endsWith('"')(trimmed) ? Str.slice(1, -1)(trimmed) : trimmed
  );

const parseDocument = (path: string, text: string): Document =>
  Match.value(Str.startsWith("---\n")(text)).pipe(
    Match.when(false, () => ({ path, meta: {}, body: text })),
    Match.orElse(() =>
      pipe(
        Str.slice(4)(text),
        Str.indexOf("\n---\n"),
        Option.map((offset) => offset + 4),
        Option.match({
          onNone: () => ({ path, meta: {}, body: text }),
          onSome: (index) => ({
            path,
            meta: pipe(
              Str.slice(4, index)(text),
              Str.split("\n"),
              Arr.map((line) =>
                pipe(
                  Option.fromNullishOr(frontmatterLine.exec(line)),
                  Option.flatMap((match) =>
                    Option.all([Option.fromNullishOr(match[1]), Option.fromNullishOr(match[2])])
                  ),
                  Option.map(([key, value]): readonly [string, string] => [key, unquote(value)])
                )
              ),
              Arr.getSomes,
              Rec.fromEntries
            ),
            body: Str.slice(index + 5)(text),
          }),
        })
      )
    )
  );

const makeSearch = Effect.gen(function* () {
  const cfg = yield* SearchConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const rootOf = (corpus: CorpusName) =>
    pipe(
      Option.fromNullishOr(cfg.roots[corpus]),
      Option.match({
        onNone: () =>
          corpusDir(corpus).pipe(
            Effect.mapError((cause) =>
              SearchError.make({ code: "search.OPEN", corpus, cause: cause.message })
            )
          ),
        onSome: Effect.succeed,
      })
    );

  const open = (corpus: CorpusName) =>
    Effect.gen(function* () {
      const root = yield* rootOf(corpus);
      const present = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
      yield* Effect.when(
        Effect.fail(SearchError.make({ code: "search.OPEN", corpus, cause: root })),
        Effect.succeed(!present)
      );
      const finder = yield* Effect.acquireRelease(
        Effect.suspend(() => {
          const created = FileFinder.create({
            basePath: root,
            aiMode: true,
            disableWatch: true,
          });
          return created.ok
            ? Effect.succeed(created.value)
            : Effect.fail(SearchError.make({ code: "search.OPEN", corpus, cause: created.error }));
        }),
        (instance) => Effect.sync(() => instance.destroy())
      );
      const scanned = yield* Effect.promise(() => finder.waitForScan(cfg.scanTimeoutMs));
      yield* Effect.when(
        Effect.fail(SearchError.make({ code: "search.SCAN", corpus })),
        Effect.succeed(!scanned.ok || !scanned.value)
      );
      return { root, finder };
    });

  const scope = yield* Effect.scope;
  const leis = yield* Effect.cached(open("leis").pipe(Effect.provideService(Scope.Scope, scope)));
  const precedentes = yield* Effect.cached(
    open("precedentes").pipe(Effect.provideService(Scope.Scope, scope))
  );

  const finderOf = (corpus: CorpusName) =>
    Match.value(corpus).pipe(
      Match.when("leis", () => leis),
      Match.when("precedentes", () => precedentes),
      Match.exhaustive
    );

  const find = (corpus: CorpusName, query: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const { finder } = yield* finderOf(corpus);
      const found = finder.fileSearch(query, { pageSize: options?.limit ?? 10 });
      return yield* found.ok
        ? Effect.succeed(
            pipe(
              Arr.zip(found.value.items, found.value.scores),
              Arr.filter(([item]) => isContent(item.relativePath)),
              Arr.map(([item, score]): DocumentHit => ({
                path: item.relativePath,
                score: score.total,
              }))
            )
          )
        : Effect.fail(SearchError.make({ code: "search.QUERY", corpus, cause: found.error }));
    });

  const grep = (
    corpus: CorpusName,
    patterns: readonly string[],
    options?: { readonly limit?: number; readonly within?: string; readonly context?: number }
  ) =>
    Effect.gen(function* () {
      const { finder } = yield* finderOf(corpus);
      const context = options?.context ?? 1;
      const found = finder.multiGrep({
        patterns: [...patterns],
        ...(options?.within === undefined ? {} : { constraints: options.within }),
        smartCase: true,
        maxMatchesPerFile: 3,
        beforeContext: context,
        afterContext: context,
        pageSize: options?.limit ?? 20,
      });
      return yield* found.ok
        ? Effect.succeed(
            Arr.map(
              Arr.filter(found.value.items, (item) => isContent(item.relativePath)),
              (item): LineHit => ({
                path: item.relativePath,
                line: item.lineNumber,
                text: item.lineContent,
                before: item.contextBefore ?? [],
                after: item.contextAfter ?? [],
              })
            )
          )
        : Effect.fail(SearchError.make({ code: "search.QUERY", corpus, cause: found.error }));
    });

  const read = (corpus: CorpusName, relativePath: string) =>
    Effect.gen(function* () {
      const { root } = yield* finderOf(corpus);
      const full = path.resolve(root, relativePath);
      yield* Effect.when(
        Effect.fail(SearchError.make({ code: "search.PATH", corpus, cause: relativePath })),
        Effect.succeed(!Str.startsWith(`${root}${path.sep}`)(full) || !Str.endsWith(".md")(full))
      );
      const text = yield* fs
        .readFileString(full)
        .pipe(
          Effect.mapError((cause) =>
            SearchError.make({ code: "search.READ", corpus, cause: String(cause) })
          )
        );
      return parseDocument(relativePath, text);
    });

  return { find, grep, read };
});

export class Search extends Context.Service<Search, Effect.Success<typeof makeSearch>>()(
  "dados-publicos-mcp/kernel/search/search"
) {}

export const SearchLive = Layer.effect(Search)(makeSearch).pipe(Layer.provide(BunServices.layer));
