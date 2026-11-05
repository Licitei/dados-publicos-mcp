import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Path from "effect/Path";
import * as Str from "effect/String";
import { BunServices } from "@effect/platform-bun";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { dataDirPath } from "../data-dir";

export const CorpusName = Schema.Literals(["leis", "precedentes"]);
export type CorpusName = (typeof CorpusName)["Type"];

export const corpusNames: readonly CorpusName[] = CorpusName.literals;

const corpusRepos: Readonly<Record<CorpusName, string>> = {
  leis: "https://github.com/minutei-ai/leis.git",
  precedentes: "https://github.com/minutei-ai/precedentes.git",
};

const CorpusErrorCode = Schema.Literals(["corpus.DIR", "corpus.GIT"]);
type CorpusErrorCode = (typeof CorpusErrorCode)["Type"];

class CorpusError extends Schema.TaggedError<CorpusError, { readonly brand: unique symbol }>()(
  "CorpusError",
  {
    code: CorpusErrorCode,
    corpus: CorpusName,
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "corpus.DIR":
        return `Falha ao preparar o diretório do acervo ${this.corpus}.`;
      case "corpus.GIT":
        return `Falha ao sincronizar o acervo ${this.corpus} com o git (o git está instalado?).`;
    }
  }
}

const SyncOptions = Schema.Struct({
  dir: Schema.String,
  paths: Schema.Array(Schema.String),
});
type SyncOptions = (typeof SyncOptions)["Type"];

export const corpusDir = (corpus: CorpusName) =>
  dataDirPath.pipe(
    Effect.mapBoth({
      onSuccess: (base) => `${base}/acervos/${corpus}`,
      onFailure: (cause) => CorpusError.make({ code: "corpus.DIR", corpus, cause: cause.message }),
    })
  );

const makeCorpusGit = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const git = (corpus: CorpusName, args: readonly string[], cwd?: string) =>
    spawner
      .string(
        ChildProcess.make("git", [...args], {
          ...(cwd === undefined ? {} : { cwd }),
          env: { GIT_TERMINAL_PROMPT: "0" },
          extendEnv: true,
        })
      )
      .pipe(
        Effect.mapBoth({
          onSuccess: Str.trim,
          onFailure: (cause) =>
            CorpusError.make({ code: "corpus.GIT", corpus, cause: String(cause) }),
        })
      );

  const sync = (corpus: CorpusName, options: SyncOptions) =>
    Effect.gen(function* () {
      const cloned = yield* fs
        .exists(path.join(options.dir, ".git"))
        .pipe(
          Effect.mapError((cause) =>
            CorpusError.make({ code: "corpus.DIR", corpus, cause: String(cause) })
          )
        );
      yield* cloned
        ? pipe(
            git(corpus, ["fetch", "--depth", "1", "origin", "HEAD"], options.dir),
            Effect.andThen(git(corpus, ["reset", "--hard", "FETCH_HEAD"], options.dir))
          )
        : pipe(
            fs.makeDirectory(path.dirname(options.dir), { recursive: true }),
            Effect.mapError((cause) =>
              CorpusError.make({ code: "corpus.DIR", corpus, cause: String(cause) })
            ),
            Effect.andThen(
              git(corpus, [
                "clone",
                "--depth",
                "1",
                "--single-branch",
                ...(Arr.isReadonlyArrayNonEmpty(options.paths)
                  ? ["--sparse", "--filter=blob:none"]
                  : []),
                corpusRepos[corpus],
                options.dir,
              ])
            )
          );
      yield* Effect.when(
        git(
          corpus,
          [
            "sparse-checkout",
            "set",
            "--no-cone",
            ...Arr.map(options.paths, (entry) => `/${entry}/`),
          ],
          options.dir
        ),
        Effect.succeed(Arr.isReadonlyArrayNonEmpty(options.paths))
      );
      const commit = yield* git(corpus, ["rev-parse", "HEAD"], options.dir);
      return { corpus, dir: options.dir, commit };
    });

  const remoteHead = (corpus: CorpusName) =>
    git(corpus, ["ls-remote", corpusRepos[corpus], "HEAD"]).pipe(
      Effect.map((line) =>
        pipe(
          line,
          Str.split(/\s+/),
          Arr.head,
          Option.getOrElse(() => line)
        )
      )
    );

  const localHead = (corpus: CorpusName, dir: string) =>
    fs.exists(path.join(dir, ".git")).pipe(
      Effect.orElseSucceed(() => false),
      Effect.flatMap((cloned) =>
        cloned
          ? git(corpus, ["log", "-1", "--format=%H %cI"], dir).pipe(
              Effect.map((line) => {
                const [commit, date] = Str.split(line, " ");
                return Option.some({ commit: commit ?? line, date: date ?? "" });
              })
            )
          : Effect.succeedNone
      )
    );

  return { sync, remoteHead, localHead };
});

export class CorpusGit extends Context.Service<CorpusGit, Effect.Success<typeof makeCorpusGit>>()(
  "dados-publicos-mcp/kernel/search/corpus/CorpusGit"
) {}

export const CorpusGitLive = Layer.effect(CorpusGit)(makeCorpusGit).pipe(
  Layer.provide(BunServices.layer)
);
