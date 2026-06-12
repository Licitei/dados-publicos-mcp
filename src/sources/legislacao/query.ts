import { Effect, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { Embedder } from "../../kernel/embed/embedder";
import { LegislacaoError } from "./errors";

const rrfK = 60;
const candidates = 50;

const asVector = (embedding: readonly number[]) => `[${embedding.join(",")}]`;

export const search = (
  termo: string,
  options?: { normaId?: string; limit?: number }
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const embedder = yield* Embedder;
    const [embedding] = yield* embedder.embed("query", [termo]);
    const queryVector = asVector(embedding);
    const limit = options?.limit ?? 10;
    const normaFilter = Match.value(options?.normaId).pipe(
      Match.when(Match.string, (id) => sql`where norma_id = ${id}`),
      Match.orElse(() => sql``)
    );
    const normaAnd = Match.value(options?.normaId).pipe(
      Match.when(Match.string, (id) => sql`and norma_id = ${id}`),
      Match.orElse(() => sql``)
    );

    return yield* db.execute(sql`
      with bm as (
        select path, rk from (
          select path, norma_id, row_number() over () as rk
          from (
            select path, norma_id
            from legislacao_node
            order by text <@> to_bm25query(${termo})
            limit ${sql.raw(String(candidates))}
          ) ranked
        ) s
        ${normaFilter}
      ),
      vec as (
        select path, row_number() over (order by dist) as rk
        from (
          select path, embedding <=> ${queryVector}::vector as dist
          from legislacao_node
          where embedding is not null ${normaAnd}
          order by dist
          limit ${sql.raw(String(candidates))}
        ) ranked
      )
      select
        n.path, n.norma_id, n.kind, n.label, n.heading, n.text,
        coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
          + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
      from bm
      full outer join vec on bm.path = vec.path
      join legislacao_node n on n.path = coalesce(bm.path, vec.path)
      order by score desc
      limit ${sql.raw(String(limit))}
    `);
  });

export const getToc = (normaId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const rows = yield* db.execute(sql`
      select path, parent_path, kind, label, nlevel(path) as depth
      from legislacao_node
      where norma_id = ${normaId}
      order by position
    `);
    return yield* Match.value(rows.length).pipe(
      Match.when(0, () =>
        Effect.fail(
          new LegislacaoError({ code: "legislacao.NOT_INDEXED", norma: normaId })
        )
      ),
      Match.orElse(() => Effect.succeed(rows))
    );
  });

export const getNode = (path: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const rows = yield* db.execute(sql`
      select path, norma_id, kind, label, heading, text, summary
      from legislacao_node where path = ${path}::ltree
    `);
    return yield* Match.value(rows[0]).pipe(
      Match.when(Match.undefined, () =>
        Effect.fail(
          new LegislacaoError({ code: "legislacao.NODE_NOT_FOUND", path })
        )
      ),
      Match.orElse((found) =>
        Effect.gen(function* () {
          const breadcrumb = yield* db.execute(sql`
            select label from legislacao_node
            where path @> ${path}::ltree and path <> ${path}::ltree
            order by nlevel(path)
          `);
          const children = yield* db.execute(sql`
            select path, kind, label from legislacao_node
            where parent_path = ${path}::ltree
            order by position
          `);
          return {
            node: found,
            breadcrumb: breadcrumb.map((row) => row.label),
            children,
          };
        })
      )
    );
  });

export const getArticle = (
  normaId: string,
  rootSegment: string,
  artigo: string | number
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const numero = String(artigo).replace(/\D/g, "");
    const lquery = `${rootSegment}.*.art${numero}`;
    const rows = yield* db.execute(sql`
      select path from legislacao_node
      where norma_id = ${normaId}
        and kind = 'artigo'
        and path ~ ${lquery}::lquery
      order by nlevel(path)
      limit 1
    `);
    return yield* Match.value(rows[0]).pipe(
      Match.when(Match.undefined, () =>
        Effect.fail(
          new LegislacaoError({
            code: "legislacao.NODE_NOT_FOUND",
            path: lquery,
          })
        )
      ),
      Match.orElse((found) => getNode(String(found.path)))
    );
  });
