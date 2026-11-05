import { BunServices } from "@effect/platform-bun";
import { Layer } from "effect";
import { DbLayer } from "../../../src/kernel/db/client";
import { provisionSchema } from "../../../src/kernel/db/provision";

export const TestDbLive = Layer.effectDiscard(provisionSchema).pipe(
  Layer.provideMerge(DbLayer),
  Layer.provide(BunServices.layer)
);
