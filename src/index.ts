import { Console, Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Argument, Command, Flag } from "effect/cli";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  IndexDeployer,
  IndexDeployerLive,
  type IndexDeployFailure,
} from "../infra/local-index.run";
import { FonteKey, type Scope } from "./serve/index-registry";
import { serve } from "./serve/server";

class UnknownFonteError extends Schema.TaggedError<
  UnknownFonteError,
  { readonly brand: unique symbol }
>()("UnknownFonteError", { fonte: Schema.String }) {
  override get message() {
    return `Fonte desconhecida: ${this.fonte}`;
  }
}

const splitParts = (value: string) => Arr.map(Str.split(value, ","), (part) => Str.trim(part));

const splitUpper = (value: string) =>
  Arr.filter(
    Arr.map(splitParts(value), (part) => Str.toUpperCase(part)),
    (part) => part.length > 0
  );

const splitNumbers = (value: string) =>
  Arr.filter(
    Arr.map(splitParts(value), (part) => Number(part)),
    (part) => Number.isFinite(part)
  );

const buildScope = (input: {
  readonly ufs: Option.Option<string>;
  readonly anos: Option.Option<string>;
  readonly mes: Option.Option<string>;
}): Scope => ({
  ...Option.match(input.ufs, {
    onNone: () => ({}),
    onSome: (value) => ({ ufs: splitUpper(value) }),
  }),
  ...Option.match(input.anos, {
    onNone: () => ({}),
    onSome: (value) => ({ anos: splitNumbers(value) }),
  }),
  ...Option.match(input.mes, {
    onNone: () => ({}),
    onSome: (value) => ({ mes: Str.trim(value) }),
  }),
});

const decodeFonte = Schema.decodeUnknownOption(FonteKey);

const indexedJson = Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

type IndexRun = Effect.Effect<
  void,
  UnknownFonteError | IndexDeployFailure | Schema.SchemaError,
  IndexDeployer
>;

const runOne = (fonte: string, scope: Scope): IndexRun =>
  decodeFonte(fonte).pipe(
    Option.match({
      onNone: () =>
        Console.error(`Fontes disponiveis: ${Arr.join(FonteKey.literals, ", ")}`).pipe(
          Effect.andThen(Effect.fail(UnknownFonteError.make({ fonte })))
        ),
      onSome: (key) =>
        Effect.gen(function* () {
          const deployer = yield* IndexDeployer;
          const output = yield* deployer.deployIndex(key, scope);
          const summary = yield* indexedJson(output.indexed);
          yield* Console.log(`ok "${key}": ${summary}`);
        }),
    })
  );

const runAll = (includeHeavy: boolean, scope: Scope): IndexRun =>
  Effect.gen(function* () {
    const deployer = yield* IndexDeployer;
    const output = yield* deployer.deployAll(includeHeavy, scope);
    yield* Console.log(`${output.indexed.length} fonte(s) indexada(s) com sucesso.`);
  });

const indexCommand = Command.make(
  "index",
  {
    fonte: Argument.String("fonte").pipe(
      Argument.optional,
      Argument.withDescription("Fonte a indexar. Sem fonte: indexa todas as fontes leves.")
    ),
    includeHeavy: Flag.Boolean("include-heavy").pipe(
      Flag.withDescription("Indexa todas as fontes, incluindo as que exigem download pesado")
    ),
    ufs: Flag.String("ufs").pipe(
      Flag.optional,
      Flag.withDescription("Recorte de UFs (separadas por virgula). Ex: SP,RJ")
    ),
    anos: Flag.String("anos").pipe(
      Flag.optional,
      Flag.withDescription("Recorte de anos (separados por virgula). Ex: 2024,2025")
    ),
    mes: Flag.String("mes").pipe(
      Flag.optional,
      Flag.withDescription("Recorte de mes (YYYY-MM). Ex: 2026-01")
    ),
  },
  (config) =>
    Option.match(config.fonte, {
      onNone: () => runAll(config.includeHeavy, buildScope(config)),
      onSome: (fonte) => runOne(fonte, buildScope(config)),
    })
).pipe(
  Command.withDescription(
    "Recria indice(s) local(is) via Alchemy. Sem fonte: indexa todas as fontes leves."
  )
);

const root = Command.make("dados-publicos-mcp", {}, () => Effect.promise(() => serve())).pipe(
  Command.withDescription("Inicia o servidor MCP via stdio."),
  Command.withSubcommands([indexCommand])
);

Command.run(root, { version: "0.1.0" }).pipe(
  Effect.provide([BunServices.layer, IndexDeployerLive]),
  BunRuntime.runMain
);
