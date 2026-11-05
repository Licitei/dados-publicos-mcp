import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Alchemy from "alchemy";
import * as Provider from "alchemy/Provider";
import { deploy } from "alchemy/Deploy";
import { LoggingCli } from "alchemy/Cli/LoggingCli";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { ArtifactStore, createArtifactStore } from "alchemy/Artifacts";
import { AuthProvidersLive } from "alchemy/Auth/Registry";
import * as Interaction from "alchemy/Interaction";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import { FonteKey, IndexFailure, indexRegistry, type Scope } from "../src/serve/index-registry";
import { failureText, type AppServices } from "../src/serve/tool";
import { runtime } from "../src/runtime";
import { McpProviders } from "./providers";
import {
  LocalIndex,
  LocalIndexClass,
  LocalIndexProvider,
  type LocalIndexConfig,
} from "./local-index";

export class IndexDeployFailure extends Schema.TaggedError<
  IndexDeployFailure,
  { readonly brand: unique symbol }
>()("IndexDeployFailure", { text: Schema.String }) {
  override get message() {
    return this.text;
  }
}

const inRuntime = <A>(effect: Effect.Effect<A, IndexFailure, AppServices>) =>
  Effect.promise(() => runtime.runPromiseExit(effect)).pipe(
    Effect.flatten,
    Effect.mapError((error) => IndexFailure.make({ text: failureText(error) }))
  );

export const defaultConfig: LocalIndexConfig = {
  registry: indexRegistry,
  version: (entry) =>
    Option.fromNullishOr(entry.version).pipe(
      Option.match({
        onNone: () => Effect.succeed(null),
        onSome: inRuntime,
      })
    ),
  run: (entry, scope) =>
    Effect.promise(() => runtime.runPromiseExit(entry.run(scope))).pipe(
      Effect.flatten,
      Effect.mapError((error) => IndexFailure.make({ text: failureText(error) }))
    ),
};

export const providers = Layer.effect(McpProviders, Provider.collection([LocalIndexClass])).pipe(
  Layer.provide(LocalIndexProvider(defaultConfig)),
  Layer.orDie
);

const deployDeps = Layer.mergeAll(
  LoggingCli,
  AlchemyContextLive,
  Alchemy.localState(),
  Layer.succeed(ArtifactStore, createArtifactStore()),
  Interaction.layer(),
  AuthProvidersLive
).pipe(Layer.provideMerge(PlatformServices));

type IndexTarget = { readonly fonte: FonteKey; readonly scope: Scope };

const indexStack = (targets: ReadonlyArray<IndexTarget>) =>
  Alchemy.Stack(
    "DadosPublicosIndex",
    { providers, state: Alchemy.localState() },
    Effect.gen(function* () {
      const indexed = yield* Effect.forEach(
        targets,
        (target) =>
          LocalIndex(target.fonte, {
            fonte: target.fonte,
            scope: target.scope,
          }).pipe(
            Effect.map((resource) => ({
              fonte: resource.fonte,
              rows: resource.rows,
            }))
          ),
        { concurrency: 1 }
      );
      return { indexed };
    })
  );

const makeDeployer = Effect.gen(function* () {
  const context = yield* Layer.build(deployDeps).pipe(
    Effect.mapError((error) => IndexDeployFailure.make({ text: failureText(error) }))
  );

  const deployIndex = (fonte: FonteKey, scope: Scope) =>
    deploy({ stack: indexStack([{ fonte, scope }]), stage: "local" }).pipe(
      Effect.provideContext(context),
      Effect.mapError((error) => IndexDeployFailure.make({ text: failureText(error) }))
    );

  const deployAll = (includeHeavy: boolean, scope: Scope) =>
    deploy({
      stack: indexStack(
        Arr.map(
          Arr.filter(FonteKey.literals, (fonte) => includeHeavy || !indexRegistry[fonte].heavy),
          (fonte) => ({ fonte, scope })
        )
      ),
      stage: "local",
    }).pipe(
      Effect.provideContext(context),
      Effect.mapError((error) => IndexDeployFailure.make({ text: failureText(error) }))
    );

  return { deployIndex, deployAll };
});

export class IndexDeployer extends Context.Service<
  IndexDeployer,
  Effect.Success<typeof makeDeployer>
>()("dados-publicos-mcp/infra/local-index.run/IndexDeployer") {}

export const IndexDeployerLive = Layer.effect(IndexDeployer)(makeDeployer);
