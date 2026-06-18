import { Layer } from "effect";
import * as Effect from "effect/Effect";
import * as Alchemy from "alchemy";
import * as Provider from "alchemy/Provider";
import { deploy } from "alchemy/Deploy";
import { LoggingCli } from "alchemy/Cli/LoggingCli";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import { provisionSchema } from "../src/kernel/db/provision";
import { FonteKey, indexRegistry, type Scope } from "../src/serve/index-registry";
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
  run: (entry, scope) =>
    runtime.runPromiseExit(
      provisionSchema.pipe(Effect.andThen(entry.run(scope)))
    ),
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

const deployDeps = Layer.mergeAll(
  LoggingCli,
  AlchemyContextLive,
  Alchemy.localState()
).pipe(Layer.provideMerge(PlatformServices));

type IndexTarget = { readonly fonte: FonteKey; readonly scope: Scope };

const indexStack = (targets: readonly IndexTarget[]) =>
  Alchemy.Stack(
    "DadosPublicosIndex",
    { providers: providers(), state: Alchemy.localState() },
    Effect.gen(function* () {
      const indexed = yield* Effect.forEach(targets, (target) =>
        LocalIndex(target.fonte, {
          fonte: target.fonte,
          scope: target.scope,
        }).pipe(
          Effect.map((resource) => ({
            fonte: resource.fonte,
            rows: resource.rows,
          }))
        )
      );
      return { indexed };
    })
  );

export const deployIndex = (fonte: FonteKey, scope: Scope) =>
  deploy({ stack: indexStack([{ fonte, scope }]), stage: "local" }).pipe(
    Effect.provide(deployDeps)
  );

export const deployAll = (includeHeavy: boolean, scope: Scope) =>
  deploy({
    stack: indexStack(
      FonteKey.literals
        .filter((fonte) => includeHeavy || !indexRegistry[fonte].heavy)
        .map((fonte) => ({ fonte, scope }))
    ),
    stage: "local",
  }).pipe(Effect.provide(deployDeps));
