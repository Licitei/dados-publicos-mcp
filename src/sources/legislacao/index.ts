import { Effect, Match } from "effect";
import { Result } from "better-result";
import { sql } from "drizzle-orm";
import type { BuildSummary, IndexAdapter, StatusInfo } from "../../core/adapter";
import { Db } from "../../kernel/db/client";
import { legislacaoErrors } from "../../modules/legislacao/errors";
import { AppLayer, registerLegislacaoTools, run } from "./tools";
import { createSchema, node } from "./store";
import { indexAll } from "./indexer";

export { AppLayer, registerLegislacaoTools };
export { search, getToc, getNode, getArticle } from "./query";

const titulo = "Legislacao brasileira (Planalto)";

export const legislacaoIndexAdapter: IndexAdapter = {
  key: "legislacao",
  titulo,
  storage: "sqlite",
  requiresHeavyDownload: false,
  async build() {
    const result = await run(
      Effect.gen(function* () {
        yield* createSchema;
        return yield* indexAll;
      })
    );
    return Match.value(result).pipe(
      Match.tag("Success", (success) =>
        Result.ok({
          dominio: "legislacao",
          registros: success.success.reduce((sum, value) => sum + value, 0),
          atualizadoEm: new Date().toISOString(),
          caminho: "pglite",
        } satisfies BuildSummary)
      ),
      Match.orElse((failure) =>
        Result.err(
          legislacaoErrors.ESCRITA({
            internal: { caminho: "pglite", cause: failure.failure.message },
          })
        )
      )
    );
  },
  async status() {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Db;
        yield* createSchema;
        return yield* db.execute(sql`select count(*)::int as n from ${node}`);
      })
    );
    return Match.value(result).pipe(
      Match.tag("Success", (success) =>
        Result.ok({
          key: "legislacao",
          titulo,
          storage: "sqlite",
          requiresHeavyDownload: false,
          existe: Number(success.success[0].n) > 0,
          atualizadoEm: null,
          registros: Number(success.success[0].n) || null,
          caminho: "pglite",
        } satisfies StatusInfo)
      ),
      Match.orElse((failure) =>
        Result.err(
          legislacaoErrors.BUSCA({
            internal: { cause: failure.failure.message },
          })
        )
      )
    );
  },
};
