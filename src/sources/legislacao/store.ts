import { Context, Effect, Layer, Match } from "effect";
import { and, cosineDistance, eq, sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { node } from "../../kernel/db/schemas/legislacao";
import { Embedder } from "../../kernel/embed/embedder";
import { LegislacaoError, buildTree, normas, type Norma } from "./catalog";
import { fetchLines, passage, summarize } from "./indexer";

export type NodeRow = typeof node.$inferInsert;

export const replaceNorma = (normaId: string, rows: readonly NodeRow[]) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(node).where(eq(node.normaId, normaId));
        yield* Match.value(rows.length).pipe(
          Match.when(0, () => Effect.void),
          Match.orElse(() => tx.insert(node).values([...rows]))
        );
      })
    );
  });

const rrfK = 60;
const candidates = 50;
const defaultLimit = 10;

const makeLegislacao = Effect.gen(function* () {
  const db = yield* Db;
  const embedder = yield* Embedder;

  const getNode = (path: string) =>
    db.query.node
      .findFirst({
        where: { path },
        columns: {
          path: true,
          normaId: true,
          kind: true,
          label: true,
          heading: true,
          text: true,
          summary: true,
        },
      })
      .pipe(
        Effect.flatMap((found) =>
          Match.value(found).pipe(
            Match.when(Match.undefined, () =>
              Effect.fail(
                new LegislacaoError({ code: "legislacao.NODE_NOT_FOUND", path })
              )
            ),
            Match.orElse((current) =>
              Effect.gen(function* () {
                const breadcrumb = yield* db
                  .select({ label: node.label })
                  .from(node)
                  .where(
                    and(
                      sql`${node.path} @> ${path}::ltree`,
                      sql`${node.path} <> ${path}::ltree`
                    )
                  )
                  .orderBy(sql`nlevel(${node.path})`);
                const children = yield* db.query.node.findMany({
                  where: { parentPath: path },
                  columns: { path: true, kind: true, label: true },
                  orderBy: (n, { asc }) => asc(n.position),
                });
                return {
                  node: current,
                  breadcrumb: breadcrumb.map((row) => row.label),
                  children,
                };
              })
            )
          )
        )
      );

  const getArticle = (normaId: string, root: string, artigo: string | number) =>
    Effect.gen(function* () {
      const numero = String(artigo).replace(/\D/g, "");
      const lquery = `${root}.*.art${numero}`;
      const rows = yield* db
        .select({ path: node.path })
        .from(node)
        .where(
          and(
            eq(node.normaId, normaId),
            eq(node.kind, "artigo"),
            sql`${node.path} ~ ${lquery}::lquery`
          )
        )
        .orderBy(sql`nlevel(${node.path})`, node.path)
        .limit(1);
      return yield* Match.value(rows[0]).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new LegislacaoError({
              code: "legislacao.NODE_NOT_FOUND",
              path: lquery,
            })
          )
        ),
        Match.orElse((found) => getNode(found.path))
      );
    });

  const getToc = (normaId: string) =>
    db.query.node
      .findMany({
        where: { normaId },
        columns: { path: true, parentPath: true, kind: true, label: true },
        extras: {
          depth: (n) => sql<number>`nlevel(${n.path})`.as("depth"),
        },
        orderBy: (n, { asc }) => asc(n.position),
      })
      .pipe(
        Effect.flatMap((rows) =>
          Match.value(rows.length).pipe(
            Match.when(0, () =>
              Effect.fail(
                new LegislacaoError({
                  code: "legislacao.NOT_INDEXED",
                  norma: normaId,
                })
              )
            ),
            Match.orElse(() => Effect.succeed(rows))
          )
        )
      );

  const search = (
    termo: string,
    options?: { readonly normaId?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const [embedding] = yield* embedder.embed("query", [termo]);
      const limit = options?.limit ?? defaultLimit;
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
              from ${node}
              order by text <@> to_bm25query(${termo})
              limit ${sql.raw(String(candidates))}
            ) ranked
          ) s
          ${normaFilter}
        ),
        vec as (
          select path, row_number() over (order by dist) as rk
          from (
            select path, ${cosineDistance(node.embedding, embedding)} as dist
            from ${node}
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
        join ${node} n on n.path = coalesce(bm.path, vec.path)
        order by score desc, n.path
        limit ${sql.raw(String(limit))}
      `);
    });

  const index = (norma: Norma) =>
    Effect.gen(function* () {
      const lines = yield* fetchLines(norma.url);
      const nodes = buildTree(norma, lines);
      const embeddings = yield* embedder.embed("passage", nodes.map(passage));
      const rows = nodes.map(
        (current, position) =>
          ({
            path: current.path,
            normaId: norma.id,
            parentPath: current.parentPath,
            kind: current.kind,
            label: current.label,
            heading: current.heading,
            text: current.text,
            summary: summarize(current),
            position: current.position,
            embedding: embeddings[position],
          }) satisfies NodeRow
      );
      yield* replaceNorma(norma.id, rows);
      return rows.length;
    });

  const indexAll = Effect.forEach(normas, index, { concurrency: 2 });

  return { index, indexAll, search, getToc, getNode, getArticle };
});

export class Legislacao extends Context.Service<
  Legislacao,
  Effect.Success<typeof makeLegislacao>
>()("dados-publicos-mcp/Legislacao") {}

export const LegislacaoLive = Layer.effect(Legislacao)(makeLegislacao);
