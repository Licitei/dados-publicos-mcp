import { Context, Effect, Layer, Match, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { cosineDistance, sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { diario } from "../../kernel/db/schemas/diario";
import { diarioCnpj } from "../../kernel/db/schemas/diario-cnpj";
import { EmbedError, Embedder } from "../../kernel/embed/embedder";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  defaultScope,
  excerpt,
  extractCnpjs,
  passageDiario,
  QueridoDiarioError,
  type DiarioFlat,
} from "./catalog";
import { loadDiarios } from "./indexer";

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const rrfK = 60;
const candidates = 50;
const chunkSize = 2_000;
const excerptLimit = 600;

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const diarioView = sql`
  d.id, d.territory_id as "territoryId", d.uf, d.municipio, d.ano,
  d.data, d.poder, d.edicao, d.edicao_extra as "edicaoExtra",
  d.url_original as "urlOriginal",
  left(d.conteudo, ${sql.raw(String(excerptLimit))}) as conteudo
`;

const makeQueridoDiario = Effect.gen(function* () {
  const db = yield* Db;
  const embedder = yield* Embedder;

  const insertChunk = (batch: readonly (DiarioFlat & {
    readonly embedding: number[] | undefined;
  })[]) =>
    Effect.gen(function* () {
      const inserted = yield* db
        .insert(diario)
        .values([...batch])
        .returning({ id: diario.id });
      const cnpjRows = Arr.flatMap(batch, (row, position) =>
        pipe(
          Arr.get(inserted, position),
          Option.match({
            onNone: () => [],
            onSome: ({ id }) =>
              Arr.map(extractCnpjs(row.conteudo), (cnpj) => ({
                diarioId: id,
                cnpj,
              })),
          })
        )
      );
      yield* Effect.forEach(
        chunks(cnpjRows),
        (rows) => db.insert(diarioCnpj).values([...rows]),
        { concurrency: 1, discard: true }
      );
      return cnpjRows.length;
    });

  const indexDiarios = (flat: readonly DiarioFlat[]) =>
    Effect.gen(function* () {
      const embeddings = yield* Match.value(flat.length).pipe(
        Match.when(0, () => Effect.succeed<number[][]>([])),
        Match.orElse(() => embedder.embed("passage", Arr.map(flat, passageDiario)))
      );
      const rows = Arr.map(flat, (row, position) => ({
        ...row,
        embedding: embeddings[position],
      }));
      const counts = yield* Effect.forEach(chunks(rows), insertChunk, {
        concurrency: 1,
      });
      return {
        diarios: rows.length,
        cnpjs: Arr.reduce(counts, 0, (acc, count) => acc + count),
      };
    });

  const indexScope = (scope: readonly { readonly uf: string; readonly ano: number }[]) =>
    Effect.gen(function* () {
      yield* db.delete(diario);
      yield* db.delete(diarioCnpj);
      const counts = yield* Effect.forEach(
        scope,
        ({ uf, ano }) => Effect.flatMap(loadDiarios(uf, ano), indexDiarios),
        { concurrency: 1 }
      );
      return Arr.reduce(
        counts,
        { diarios: 0, cnpjs: 0 },
        (acc, count) => ({
          diarios: acc.diarios + count.diarios,
          cnpjs: acc.cnpjs + count.cnpjs,
        })
      );
    });

  const buscarDiarios = (
    termo: string,
    options?: { readonly territoryId?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      yield* Match.value(q.length).pipe(
        Match.when(0, () =>
          Effect.fail(
            QueridoDiarioError.make({ code: "querido-diario.MISSING_TERMO" })
          )
        ),
        Match.orElse(() => Effect.void)
      );
      const limit = clamp(options?.limit, 20, 100);
      const queryVector = yield* embedder.embed("query", [termo]).pipe(
        Effect.flatMap((vectors) =>
          Effect.fromOption(Arr.head(vectors), () =>
            EmbedError.make({ code: "embed.RUN" })
          )
        )
      );
      const territoryWhere = Match.value(options?.territoryId).pipe(
        Match.when(Match.string, (value) => sql`where d.territory_id = ${value}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        with bm as (
          select id, rk from (
            select id, row_number() over () as rk
            from (
              select id
              from ${diario}
              order by busca <@> to_bm25query(${q})
              limit ${sql.raw(String(candidates))}
            ) ranked
          ) s
        ),
        vec as (
          select id, row_number() over (order by dist) as rk
          from (
            select id, ${cosineDistance(diario.embedding, queryVector)} as dist
            from ${diario}
            where embedding is not null
            order by dist
            limit ${sql.raw(String(candidates))}
          ) ranked
        )
        select
          ${diarioView},
          coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
            + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
        from bm
        full outer join vec on bm.id = vec.id
        join ${diario} d on d.id = coalesce(bm.id, vec.id)
        ${territoryWhere}
        order by score desc, d.id
        limit ${sql.raw(String(limit))}
      `).pipe(Effect.map(({ rows }) => rows));
    });

  const diariosPorMunicipio = (
    territoryId: string,
    options?: { readonly limit?: number }
  ) =>
    db.query.diario
      .findMany({
        where: { territoryId },
        columns: {
          id: true,
          territoryId: true,
          uf: true,
          municipio: true,
          ano: true,
          data: true,
          poder: true,
          edicao: true,
          edicaoExtra: true,
          urlOriginal: true,
        },
        orderBy: (d, { desc }) => desc(d.data),
        limit: clamp(options?.limit, 20, 100),
      });

  const buscarCnpjEmDiario = (
    cnpj: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(cnpj);
      const limit = clamp(options?.limit, 20, 100);
      const matches = yield* db.query.diarioCnpj.findMany({
        where: { cnpj: alvo },
        columns: { diarioId: true, cnpj: true },
        limit,
      });
      const ids = Arr.dedupe(Arr.map(matches, (row) => row.diarioId));
      const diarios = yield* db.query.diario.findMany({
        where: { id: { in: ids } },
        columns: {
          id: true,
          territoryId: true,
          uf: true,
          municipio: true,
          ano: true,
          data: true,
          poder: true,
          edicao: true,
          urlOriginal: true,
          conteudo: true,
        },
      });
      const byId = new Map(Arr.map(diarios, (row) => [row.id, row] as const));
      return Arr.flatMap(matches, (match) => {
        const found = byId.get(match.diarioId);
        return found !== undefined
          ? [
              {
                cnpj: match.cnpj,
                diario: {
                  ...found,
                  conteudo: excerpt(found.conteudo, excerptLimit),
                },
              },
            ]
          : [];
      });
    });

  const index = indexScope(defaultScope);

  return {
    index,
    indexAll: index,
    indexScope,
    buscarDiarios,
    diariosPorMunicipio,
    buscarCnpjEmDiario,
  };
});

export class QueridoDiario extends Context.Service<
  QueridoDiario,
  Effect.Success<typeof makeQueridoDiario>
>()("dados-publicos-mcp/sources/querido-diario/store/QueridoDiario") {}

export const QueridoDiarioLive = Layer.effect(QueridoDiario)(makeQueridoDiario);
