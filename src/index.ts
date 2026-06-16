#!/usr/bin/env bun

import {
  Cause,
  Console,
  Effect,
  Exit,
  Match,
  Option,
  Schema,
} from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { runtime } from "./runtime";
import {
  FonteKey,
  indexRegistry,
  type IndexEntry,
  type Scope,
} from "./serve/index-registry";
import { serve } from "./serve/server";

class IndexError extends Schema.TaggedErrorClass<IndexError>()("IndexError", {
  fontes: Schema.Number,
}) {
  override get message() {
    return `${this.fontes} fonte(s) falharam ao indexar.`;
  }
}

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

const failureMessage = (cause: Cause.Cause<unknown>) =>
  Cause.findErrorOption(cause).pipe(
    Option.map((error) =>
      error !== null && typeof error === "object" && "message" in error
        ? String(Reflect.get(error, "message"))
        : String(error)
    ),
    Option.getOrElse(() => Cause.pretty(cause))
  );

const runEntry = (fonte: FonteKey, entry: IndexEntry, scope: Scope) =>
  Effect.promise(() => runtime.runPromiseExit(entry.run(scope))).pipe(
    Effect.flatMap((exit) =>
      Exit.match(exit, {
        onSuccess: (summary) =>
          Console.log(`  ok "${fonte}": ${JSON.stringify(summary)}`).pipe(
            Effect.as(true)
          ),
        onFailure: (cause) =>
          Console.error(`  falha "${fonte}": ${failureMessage(cause)}`).pipe(
            Effect.as(false)
          ),
      })
    )
  );

const decodeFonte = Schema.decodeUnknownOption(FonteKey);

const runOne = (
  fonte: string,
  scope: Scope
): Effect.Effect<void, IndexError | UnknownFonteError> =>
  decodeFonte(fonte).pipe(
    Option.match({
      onNone: () =>
        Console.error(
          `Fontes disponiveis: ${FonteKey.literals.join(", ")}`
        ).pipe(Effect.andThen(Effect.fail(new UnknownFonteError({ fonte })))),
      onSome: (key) =>
        runEntry(key, indexRegistry[key], scope).pipe(
          Effect.flatMap((ok) =>
            Match.value(ok).pipe(
              Match.when(true, () => Effect.void),
              Match.orElse(() => Effect.fail(new IndexError({ fontes: 1 })))
            )
          )
        ),
    })
  );

const runAll = (
  includeHeavy: boolean,
  scope: Scope
): Effect.Effect<void, IndexError | UnknownFonteError> =>
  Effect.gen(function* () {
    const entries = FonteKey.literals.filter(
      (key) => includeHeavy || !indexRegistry[key].heavy
    );
    const pulados = FonteKey.literals.filter(
      (key) => !includeHeavy && indexRegistry[key].heavy
    );
    yield* Match.value(pulados.length).pipe(
      Match.when(0, () => Effect.void),
      Match.orElse(() =>
        Console.log(
          `Pulando fontes pesadas (use --include-heavy): ${pulados.join(", ")}`
        )
      )
    );
    const results = yield* Effect.forEach(entries, (key) =>
      runEntry(key, indexRegistry[key], scope)
    );
    const falhas = results.filter((ok) => !ok).length;
    return yield* Match.value(falhas).pipe(
      Match.when(0, () =>
        Console.log(`${entries.length} fonte(s) indexada(s) com sucesso.`)
      ),
      Match.orElse(() =>
        Console.error(`${falhas} fonte(s) falharam.`).pipe(
          Effect.andThen(Effect.fail(new IndexError({ fontes: falhas })))
        )
      )
    );
  });

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
  (config) => {
    const scope = buildScope(config);
    return Option.match(config.fonte, {
      onNone: () => runAll(config.includeHeavy, scope),
      onSome: (fonte) => runOne(fonte, scope),
    });
  }
).pipe(
  Command.withDescription(
    "Recria indice(s) local(is). Sem fonte: indexa todas as fontes leves."
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
