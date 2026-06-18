import { Effect, Layer } from "effect";
import { DbConfig } from "./client";
import { dataDirPath } from "./data-dir";

export const DbPersistenceLive = Layer.effect(DbConfig)(
  dataDirPath.pipe(Effect.map((dataDir) => ({ dataDir })))
);
