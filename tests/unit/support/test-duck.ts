import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Option } from "effect";
import * as FileSystem from "effect/FileSystem";
import { DuckConfig, DuckLive } from "../../../src/kernel/duck/duck";

const TestDuckConfig = Layer.effect(DuckConfig)(
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped()).pipe(
    Effect.map((dir) => ({ dir: Option.some(dir) })),
    Effect.orDie
  )
).pipe(Layer.provide(BunServices.layer));

export const TestDuckLive = DuckLive.pipe(Layer.provide(TestDuckConfig));
