import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect, Layer, ManagedRuntime, Match, Result } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { dominioDir } from "../../core/dataDir";
import { Db, DbConfig, DbLayer } from "../../kernel/db/client";
import { EmbedderLive } from "../../kernel/embed/embedder";
import { findNorma, normas } from "./catalog";
import { createSchema, node } from "./store";
import { indexAll } from "./indexer";
import { LegislacaoError } from "./errors";
import { getArticle, getNode, getToc, search } from "./query";

const DbConfigLayer = Layer.succeed(DbConfig, {
  dataDir: dominioDir("legislacao-v2"),
});

export const AppLayer = Layer.mergeAll(
  DbLayer,
  EmbedderLive,
  FetchHttpClient.layer
).pipe(Layer.provide(DbConfigLayer));

const runtime = ManagedRuntime.make(AppLayer);

export const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>
) => runtime.runPromise(effect.pipe(Effect.result));

const toolText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const fold = <A, E extends { message: string }>(result: Result.Result<A, E>) =>
  toolText(
    Match.value(result).pipe(
      Match.tag("Success", (success) => ({ ok: true, data: success.success })),
      Match.orElse((failure) => ({ ok: false, error: failure.failure.message }))
    )
  );

const rootSegment = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const reindex = Effect.gen(function* () {
  yield* createSchema;
  return yield* indexAll;
});

const count = Effect.gen(function* () {
  const db = yield* Db;
  yield* createSchema;
  return yield* db.execute(sql`select count(*)::int as n from ${node}`);
});

const resolveNorma = (norma: string) =>
  Match.value(findNorma(norma)).pipe(
    Match.when(Match.undefined, () =>
      Effect.fail(
        new LegislacaoError({ code: "legislacao.NORMA_NOT_FOUND", norma })
      )
    ),
    Match.orElse((found) => Effect.succeed(found))
  );

const tocFor = (norma: string) =>
  Effect.gen(function* () {
    const found = yield* resolveNorma(norma);
    return yield* getToc(found.id);
  });

const articleFor = (norma: string, artigo: string | number) =>
  Effect.gen(function* () {
    const found = yield* resolveNorma(norma);
    return yield* getArticle(found.id, rootSegment(found.id), artigo);
  });

const buscarInput = {
  termo: z.string().trim().min(1),
  norma: z.string().trim().min(1).optional(),
  limite: z.number().int().positive().max(25).optional(),
};

const obterInput = {
  norma: z.string().trim().min(1),
  artigo: z.union([z.string().trim().min(1), z.number()]),
};

const tocInput = {
  norma: z.string().trim().min(1),
};

const nodeInput = {
  path: z.string().trim().min(1),
};

const emptyInput = {};

export function registerLegislacaoTools(server: McpServer) {
  server.registerTool(
    "listar_normas",
    {
      description: "Lista as normas brasileiras disponiveis no catalogo.",
      inputSchema: emptyInput,
    },
    async () => toolText({ ok: true, data: normas })
  );

  server.registerTool(
    "buscar_legislacao",
    {
      description: "Busca um termo no indice local de legislacao brasileira.",
      inputSchema: buscarInput,
    },
    async (args) =>
      fold(
        await run(
          search(args.termo, { normaId: args.norma, limit: args.limite })
        )
      )
  );

  server.registerTool(
    "obter_artigo",
    {
      description: "Retorna um artigo especifico de uma norma brasileira.",
      inputSchema: obterInput,
    },
    async (args) => fold(await run(articleFor(args.norma, args.artigo)))
  );

  server.registerTool(
    "get_toc",
    {
      description:
        "Retorna o sumario hierarquico (table of contents) de uma norma.",
      inputSchema: tocInput,
    },
    async (args) => fold(await run(tocFor(args.norma)))
  );

  server.registerTool(
    "get_node",
    {
      description:
        "Retorna um trecho pelo caminho ltree, com breadcrumb e filhos.",
      inputSchema: nodeInput,
    },
    async (args) => fold(await run(getNode(args.path)))
  );

  server.registerTool(
    "status_indice",
    {
      description: "Mostra o status e o caminho do indice local.",
      inputSchema: emptyInput,
    },
    async () => fold(await run(count))
  );

  server.registerTool(
    "indexar_legislacao",
    {
      description:
        "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
      inputSchema: emptyInput,
    },
    async () => fold(await run(reindex))
  );
}
