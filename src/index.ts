#!/usr/bin/env bun

import { Console, Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { deployAll, deployIndex } from "../infra/local-index.run";
import { FonteKey, type Scope } from "./serve/index-registry";
import { serve } from "./serve/server";

class UnknownFonteError extends Schema.TaggedErrorClass<UnknownFonteError>()(
  "UnknownFonteError",
  { fonte: Schema.String }
) {
  override get message() {
    return `Fonte desconhecida: ${this.fonte}`;
  }
}

const splitUpper = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);

const splitNumbers = (value: string) =>
  value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

const buildScope = (input: {
  readonly ufs: Option.Option<string>;
  readonly anos: Option.Option<string>;
  readonly mes: Option.Option<string>;
}): Scope => ({
  ufs: input.ufs.pipe(Option.map(splitUpper), Option.getOrUndefined),
  anos: input.anos.pipe(Option.map(splitNumbers), Option.getOrUndefined),
  mes: input.mes.pipe(
    Option.map((value) => value.trim()),
    Option.getOrUndefined
  ),
});

const decodeFonte = Schema.decodeUnknownOption(FonteKey);

const runOne = (fonte: string, scope: Scope): Effect.Effect<void, unknown> =>
  decodeFonte(fonte).pipe(
    Option.match({
      onNone: () =>
        Console.error(
          `Fontes disponiveis: ${FonteKey.literals.join(", ")}`
        ).pipe(Effect.andThen(Effect.fail(new UnknownFonteError({ fonte })))),
      onSome: (key) =>
        deployIndex(key, scope).pipe(
          Effect.flatMap((output) =>
            Console.log(`ok "${key}": ${JSON.stringify(output.indexed)}`)
          )
        ),
    })
  );

const runAll = (
  includeHeavy: boolean,
  scope: Scope
): Effect.Effect<void, unknown> =>
  deployAll(includeHeavy, scope).pipe(
    Effect.flatMap((output) =>
      Console.log(
        `${output.indexed.length} fonte(s) indexada(s) com sucesso.`
      )
    )
  );

const indexCommand = Command.make(
  "index",
  {
    fonte: Argument.string("fonte").pipe(
      Argument.optional,
      Argument.withDescription(
        "Fonte a indexar. Sem fonte: indexa todas as fontes leves."
      )
    ),
    includeHeavy: Flag.boolean("include-heavy").pipe(
      Flag.withDescription(
        "Indexa todas as fontes, incluindo as que exigem download pesado"
      )
    ),
    ufs: Flag.string("ufs").pipe(
      Flag.optional,
      Flag.withDescription("Recorte de UFs (separadas por virgula). Ex: SP,RJ")
    ),
    anos: Flag.string("anos").pipe(
      Flag.optional,
      Flag.withDescription(
        "Recorte de anos (separados por virgula). Ex: 2024,2025"
      )
    ),
    mes: Flag.string("mes").pipe(
      Flag.optional,
      Flag.withDescription("Recorte de mes (YYYY-MM). Ex: 2026-01")
    ),
  },
  (config) =>
    Effect.suspend(() => {
      const scope = buildScope(config);
      return Option.match(config.fonte, {
        onNone: () => runAll(config.includeHeavy, scope),
        onSome: (fonte) => runOne(fonte, scope),
      });
    })
).pipe(
  Command.withDescription(
    "Recria indice(s) local(is) via Alchemy. Sem fonte: indexa todas as fontes leves."
  )
);

const root = Command.make("dados-publicos-mcp", {}, () =>
  Effect.promise(() => serve())
).pipe(
  Command.withDescription("Inicia o servidor MCP via stdio."),
  Command.withSubcommands([indexCommand])
);

Command.run(root, { version: "0.1.0" }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
);
