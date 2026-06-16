import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { medicamentoCmed } from "../../kernel/db/schemas/medicamento-cmed";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexCmed } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(medicamentoCmed),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const medicamentoView = sql`
  substancia, cnpj, doc_normalizado as "docNormalizado", laboratorio,
  ggrem, registro, ean1, produto, apresentacao,
  classe_terapeutica as "classeTerapeutica", tarja,
  pf_sem_impostos as "pfSemImpostos", pmvg_sem_impostos as "pmvgSemImpostos"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeCmed = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const bm25Medicamento = (q: string, limit: number) =>
    db.execute(sql`
      select ${medicamentoView}, -rk as score
      from (
        select
          substancia, cnpj, doc_normalizado, laboratorio, ggrem, registro,
          ean1, produto, apresentacao, classe_terapeutica, tarja,
          pf_sem_impostos, pmvg_sem_impostos, row_number() over () as rk
        from (
          select
            substancia, cnpj, doc_normalizado, laboratorio, ggrem, registro,
            ean1, produto, apresentacao, classe_terapeutica, tarja,
            pf_sem_impostos, pmvg_sem_impostos
          from ${medicamentoCmed}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmMedicamento = (q: string, limit: number) =>
    db.execute(sql`
      select ${medicamentoView}, word_similarity(${q}, busca) as score
      from ${medicamentoCmed}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `);

  const buscarMedicamento = (
    termo: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 30, 100);
      const lexical = yield* bm25Medicamento(q, limit);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmMedicamento(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const precoPorEan = (ean: string) =>
    db.execute(sql`
      select ${medicamentoView}
      from ${medicamentoCmed}
      where ean1 = ${onlyDigits(ean)}
      limit 10
    `);

  const precoPorGgrem = (ggrem: string) =>
    db.execute(sql`
      select ${medicamentoView}
      from ${medicamentoCmed}
      where ggrem = ${onlyDigits(ggrem)}
      limit 10
    `);

  const index = Effect.gen(function* () {
    yield* db.delete(medicamentoCmed);
    const inserted = yield* indexCmed;
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${medicamentoCmed}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return {
    index,
    indexAll: index,
    buscarMedicamento,
    precoPorEan,
    precoPorGgrem,
  };
});

export class CmedAnvisa extends Context.Service<
  CmedAnvisa,
  Effect.Success<typeof makeCmed>
>()("dados-publicos-mcp/CmedAnvisa") {}

export const CmedAnvisaLive = Layer.effect(CmedAnvisa)(makeCmed);
