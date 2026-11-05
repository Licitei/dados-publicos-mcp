import { Config, Effect, Layer, Match, Option, Schema } from "effect";
import { BunServices } from "@effect/platform-bun";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Path from "effect/Path";

const appDirName = "dados-publicos-mcp";

const envOption = (name: string) => Config.String(name).pipe(Config.option);

const firstSome = (options: ReadonlyArray<Option.Option<string>>): Option.Option<string> =>
  pipe(
    options,
    Arr.reduce(Option.none<string>(), (acc, candidate) => Option.orElse(acc, () => candidate))
  );

const baseDirWith = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* envOption("HOME");
  const xdgDataHome = yield* envOption("XDG_DATA_HOME");
  const localAppData = yield* envOption("LOCALAPPDATA");
  const appData = yield* envOption("APPDATA");
  const userProfile = yield* envOption("USERPROFILE");

  return Match.value(process.platform).pipe(
    Match.when("win32", () =>
      firstSome([localAppData, appData]).pipe(
        Option.orElse(() =>
          userProfile.pipe(Option.map((profile) => path.join(profile, "AppData", "Local")))
        ),
        Option.map((dir) => path.join(dir, appDirName)),
        Option.getOrElse(() => path.join(".", appDirName))
      )
    ),
    Match.orElse(() =>
      xdgDataHome.pipe(
        Option.orElse(() => home.pipe(Option.map((dir) => path.join(dir, ".local", "share")))),
        Option.map((dir) => path.join(dir, appDirName)),
        Option.getOrElse(() => path.join(".", appDirName))
      )
    )
  );
});

const resolveDataDir = Effect.gen(function* () {
  const explicit = yield* envOption("DADOS_PUBLICOS_MCP_DATA_DIR");
  return yield* Option.match(explicit, {
    onNone: () => baseDirWith,
    onSome: (value) => Effect.succeed(value),
  });
});

const DataDirErrorCode = Schema.Literals(["datadir.RESOLVE"]);

class DataDirError extends Schema.TaggedError<DataDirError, { readonly brand: unique symbol }>()(
  "DataDirError",
  {
    code: DataDirErrorCode,
    cause: Schema.String,
  }
) {
  override get message() {
    switch (this.code) {
      case "datadir.RESOLVE":
        return "Falha ao resolver o diretorio de dados local.";
    }
  }
}

const toDataDirError = Effect.mapError((cause: unknown) =>
  DataDirError.make({ code: "datadir.RESOLVE", cause: String(cause) })
);

export const dataDirPath = Effect.scoped(
  Layer.build(BunServices.layer).pipe(
    Effect.flatMap((services) => resolveDataDir.pipe(Effect.provideContext(services))),
    toDataDirError
  )
);
