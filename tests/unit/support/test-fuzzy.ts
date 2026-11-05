import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import { FuzzyConfig, FuzzyLive } from "../../../src/kernel/search/fuzzy";

const TestFuzzyConfig = Layer.effect(FuzzyConfig)(
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped()).pipe(
    Effect.map((dir) => ({ dir: Option.some(dir) })),
    Effect.orDie
  )
).pipe(Layer.provide(BunServices.layer));

export const TestFuzzyLive = FuzzyLive.pipe(Layer.provide(TestFuzzyConfig));
