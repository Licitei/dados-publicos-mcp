import { Layer } from "effect";
import * as Provider from "alchemy/Provider";
import { indexRegistry } from "../src/serve/index-registry";
import { runtime } from "../src/runtime";
import { McpProviders } from "./providers";
import { LocalDatabase, LocalDatabaseProvider } from "./local-database";
import {
  LocalIndex,
  LocalIndexProvider,
  type LocalIndexConfig,
} from "./local-index";

export const defaultConfig: LocalIndexConfig = {
  registry: indexRegistry,
  run: (entry, scope) => runtime.runPromiseExit(entry.run(scope)),
};

export const providers = () =>
  Layer.effect(
    McpProviders,
    Provider.collection([LocalDatabase, LocalIndex])
  ).pipe(
    Layer.provide(LocalDatabaseProvider()),
    Layer.provide(LocalIndexProvider(defaultConfig)),
    Layer.orDie
  );
