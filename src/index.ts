#!/usr/bin/env bun

import { cac } from "cac";
import { Cause, Effect, Exit, Match, Option, Schema } from "effect";
import { runtime } from "./runtime";
import {
  FonteKey,
  indexRegistry,
  type IndexEntry,
  type Scope,
} from "./serve/index-registry";
import { serve } from "./serve/server";

type CliIndexOptions = {
  readonly all?: boolean;
  readonly includeHeavy?: boolean;
  readonly ufs?: string;
  readonly anos?: string;
  readonly mes?: string;
};

const buildScope = (options: CliIndexOptions): Scope => ({
  ufs: Match.value(options.ufs).pipe(
    Match.when(Match.string, (value) =>
      value
        .split(",")
        .map((uf) => uf.trim().toUpperCase())
        .filter((uf) => uf.length > 0)
    ),
    Match.orElse(() => undefined)
  ),
  anos: Match.value(options.anos).pipe(
    Match.when(Match.string, (value) =>
      value
        .split(",")
        .map((ano) => Number(ano.trim()))
        .filter((ano) => Number.isFinite(ano))
    ),
    Match.orElse(() => undefined)
  ),
  mes: Match.value(options.mes).pipe(
    Match.when(Match.string, (value) => value.trim()),
    Match.orElse(() => undefined)
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

const runEntry = (fonte: string, entry: IndexEntry, scope: Scope) =>
  runtime.runPromiseExit(entry.run(scope)).then((exit) =>
    Exit.match(exit, {
      onSuccess: (summary) => {
        console.info(`  ok "${fonte}": ${JSON.stringify(summary)}`);
        return true;
      },
      onFailure: (cause) => {
        console.error(`  falha "${fonte}": ${failureMessage(cause)}`);
        return false;
      },
    })
  );

const decodeFonte = Schema.decodeUnknownOption(FonteKey);

const runOne = async (fonte: string, scope: Scope): Promise<void> => {
  await decodeFonte(fonte).pipe(
    Option.match({
      onNone: () => {
        console.error(`Fonte desconhecida: ${fonte}`);
        console.error(`Fontes disponiveis: ${FonteKey.literals.join(", ")}`);
        process.exitCode = 1;
        return Promise.resolve();
      },
      onSome: (key) =>
        runEntry(key, indexRegistry[key], scope).then((ok) => {
          process.exitCode = ok ? process.exitCode : 1;
        }),
    })
  );
};

const runAll = async (
  includeHeavy: boolean,
  scope: Scope
): Promise<void> => {
  const entries = FonteKey.literals.filter(
    (key) => includeHeavy || !indexRegistry[key].heavy
  );
  const pulados = FonteKey.literals.filter(
    (key) => !includeHeavy && indexRegistry[key].heavy
  );
  Match.value(pulados.length).pipe(
    Match.when(0, () => undefined),
    Match.orElse(() => {
      console.info(
        `Pulando fontes pesadas (use --include-heavy): ${pulados.join(", ")}`
      );
      return undefined;
    })
  );
  const results = await Promise.all(
    entries.map((key) => runEntry(key, indexRegistry[key], scope))
  );
  const falhas = results.filter((ok) => !ok).length;
  Match.value(falhas).pipe(
    Match.when(0, () => {
      console.info(`${entries.length} fonte(s) indexada(s) com sucesso.`);
      return undefined;
    }),
    Match.orElse(() => {
      console.error(`${falhas} fonte(s) falharam.`);
      process.exitCode = 1;
      return undefined;
    })
  );
};

const runIndex = async (
  fonte: string | undefined,
  options: CliIndexOptions
): Promise<void> => {
  const scope = buildScope(options);
  await Match.value(fonte).pipe(
    Match.when(Match.string, (key) => runOne(key, scope)),
    Match.orElse(() => runAll(options.includeHeavy ?? false, scope))
  );
};

const shutdown = () => {
  runtime.dispose().finally(() => process.exit(process.exitCode ?? 0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("beforeExit", shutdown);

const cli = cac("dados-publicos-mcp");

cli.command("[serve]", "Inicia o servidor MCP via stdio").action(async () => {
  await serve();
});

cli
  .command(
    "index [fonte]",
    "Recria indice(s) local(is). Sem fonte: indexa todas as fontes leves."
  )
  .option("--all", "Indexa todas as fontes leves (heavy=false)")
  .option(
    "--include-heavy",
    "Indexa todas as fontes, incluindo as que exigem download pesado"
  )
  .option("--ufs <ufs>", "Recorte de UFs (separadas por virgula). Ex: SP,RJ")
  .option("--anos <anos>", "Recorte de anos (separados por virgula). Ex: 2024,2025")
  .option("--mes <mes>", "Recorte de mes (YYYY-MM). Ex: 2026-01")
  .action(async (fonte: string | undefined, options: CliIndexOptions) => {
    await runIndex(fonte, options);
    await runtime.dispose();
    process.exit(process.exitCode ?? 0);
  });

cli.help();
cli.version("0.1.0");
cli.parse();
