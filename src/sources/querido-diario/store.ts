import { Context, Effect, Layer, Match } from "effect";
import { cosineDistance, sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { diario } from "../../kernel/db/schemas/diario";
import { diarioCnpj } from "../../kernel/db/schemas/diario-cnpj";
import { Embedder } from "../../kernel/embed/embedder";
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

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

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
      const cnpjRows = batch.flatMap((row, position) =>
        extractCnpjs(row.conteudo).map((cnpj) => ({
          diarioId: inserted[position].id,
          cnpj,
        }))
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
        Match.orElse(() => embedder.embed("passage", flat.map(passageDiario)))
      );
      const rows = flat.map((row, position) => ({
        ...row,
        embedding: embeddings[position],
      }));
      const counts = yield* Effect.forEach(chunks(rows), insertChunk, {
        concurrency: 1,
      });
      return {
        diarios: rows.length,
        cnpjs: counts.reduce((acc, count) => acc + count, 0),
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
      return counts.reduce(
        (acc, count) => ({
          diarios: acc.diarios + count.diarios,
          cnpjs: acc.cnpjs + count.cnpjs,
        }),
        { diarios: 0, cnpjs: 0 }
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
            new QueridoDiarioError({ code: "querido-diario.MISSING_TERMO" })
          )
        ),
        Match.orElse(() => Effect.void)
      );
      const limit = clamp(options?.limit, 20, 100);
      const [queryVector] = yield* embedder.embed("query", [termo]);
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
      `);
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
      const ids = [...new Set(matches.map((row) => row.diarioId))];
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
      const byId = new Map(diarios.map((row) => [row.id, row]));
      return matches.flatMap((match) => {
        const found = byId.get(match.diarioId);
        return found
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
>()("dados-publicos-mcp/QueridoDiario") {}

export const QueridoDiarioLive = Layer.effect(QueridoDiario)(makeQueridoDiario);
