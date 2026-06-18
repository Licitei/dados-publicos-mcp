import { Config, Effect, Match, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

const appDirName = "dados-publicos-mcp";

const envOption = (name: string) => Config.string(name).pipe(Config.option);

const firstSome = (
  options: ReadonlyArray<Option.Option<string>>
): Option.Option<string> =>
  options.reduce(
    (acc, candidate) => Option.orElse(acc, () => candidate),
    Option.none<string>()
  );

const baseDir = Effect.gen(function* () {
  const path = yield* Path;
  const home = yield* envOption("HOME");
  const xdgDataHome = yield* envOption("XDG_DATA_HOME");
  const localAppData = yield* envOption("LOCALAPPDATA");
  const appData = yield* envOption("APPDATA");
  const userProfile = yield* envOption("USERPROFILE");

  return Match.value(process.platform).pipe(
    Match.when("win32", () =>
      firstSome([localAppData, appData]).pipe(
        Option.orElse(() =>
          userProfile.pipe(
            Option.map((profile) => path.join(profile, "AppData", "Local"))
          )
        ),
        Option.map((dir) => path.join(dir, appDirName)),
        Option.getOrElse(() => path.join(".", appDirName))
      )
    ),
    Match.orElse(() =>
      xdgDataHome.pipe(
        Option.orElse(() =>
          home.pipe(Option.map((dir) => path.join(dir, ".local", "share")))
        ),
        Option.map((dir) => path.join(dir, appDirName)),
        Option.getOrElse(() => path.join(".", appDirName))
      )
    )
  );
});

export const dataDirPath = Effect.gen(function* () {
  const explicit = yield* envOption("DADOS_PUBLICOS_MCP_DATA_DIR");
  return yield* Option.match(explicit, {
    onNone: () => baseDir,
    onSome: (value) => Effect.succeed(value),
  });
});

export const ensureDataDir = Effect.gen(function* () {
  const dir = yield* dataDirPath;
  const fs = yield* FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  return dir;
});
