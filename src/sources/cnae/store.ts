import { Context, Effect, Layer, Match } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { cosineDistance, sql } from "drizzle-orm";
import { Db, DbError } from "../../kernel/db/client";
import { cnae } from "../../kernel/db/schemas/cnae";
import { EmbedError, Embedder } from "../../kernel/embed/embedder";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  CnaeError,
  levelByDigits,
  secaoNivel,
  subclassePassage,
  type CnaeNivel,
} from "./catalog";
import { fetchSubclasses } from "./indexer";

type CnaeRow = typeof cnae.$inferInsert;

export const replaceAll = (rows: readonly CnaeRow[]) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(cnae);
        yield* Match.value(rows.length).pipe(
          Match.when(0, () => Effect.void),
          Match.orElse(() => tx.insert(cnae).values([...rows]))
        );
      })
    );
  }).pipe(
      Effect.catchTag("SqlError", (cause) =>
        Effect.fail(DbError.make({ code: "db.QUERY", cause: String(cause) }))
      )
    );

const defaultLimit = 10;
const maxLimit = 50;
const rrfK = 60;
const candidates = 50;

const detectLevel = (codigo: string) => {
  const trimmed = pipe(codigo, Str.trim);
  return Match.value(trimmed).pipe(
    Match.when(
      (value) => /^[A-Za-z]$/.test(value),
      (value) => ({ nivel: secaoNivel, value: pipe(value, Str.toUpperCase) })
    ),
    Match.orElse((value) => {
      const digits = onlyDigits(value);
      return Match.value(levelByDigits.get(digits.length)).pipe(
        Match.when(Match.undefined, () => undefined),
        Match.orElse((nivel) => ({ nivel, value: digits }))
      );
    })
  );
};

const whereForLevel = (nivel: CnaeNivel, value: string) =>
  Match.value(nivel).pipe(
    Match.when("secao", () => ({ secaoId: value })),
    Match.when("divisao", () => ({ divisaoId: value })),
    Match.when("grupo", () => ({ grupoId: value })),
    Match.when("classe", () => ({ classeId: value })),
    Match.when("subclasse", () => ({ id: value })),
    Match.exhaustive
  );

const makeCnae = Effect.gen(function* () {
  const db = yield* Db;
  const embedder = yield* Embedder;

  const resolve = (codigo: string) =>
    Effect.gen(function* () {
      const normalizado = onlyDigits(codigo);
      const found = yield* db.query.cnae.findFirst({
        where: { id: normalizado },
      });
      return yield* Match.value(found).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            CnaeError.make({ code: "cnae.NOT_FOUND", codigo, normalizado })
          )
        ),
        Match.orElse((row) =>
          Effect.succeed({
            subclasse: { id: row.id, descricao: row.descricao },
            classe: { id: row.classeId, descricao: row.classeDescricao },
            grupo: { id: row.grupoId, descricao: row.grupoDescricao },
            divisao: { id: row.divisaoId, descricao: row.divisaoDescricao },
            secao: { id: row.secaoId, descricao: row.secaoDescricao },
          })
        )
      );
    }).pipe(
        Effect.catchTag("EffectDrizzleQueryError", (cause) =>
          Effect.fail(DbError.make({ code: "db.QUERY", cause: String(cause) }))
        )
      );

  const search = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = Math.min(
        Math.max(options?.limit ?? defaultLimit, 1),
        maxLimit
      );
      const queryVector = yield* embedder.embed("query", [termo]).pipe(
        Effect.flatMap((vectors) =>
          Effect.fromOption(Arr.head(vectors), () =>
            EmbedError.make({ code: "embed.RUN" })
          )
        )
      );
      return yield* db.execute(sql`
        with bm as (
          select id, rk from (
            select id, row_number() over () as rk
            from (
              select id
              from ${cnae}
              order by busca <@> to_bm25query(${q})
              limit ${sql.raw(String(candidates))}
            ) ranked
          ) s
        ),
        vec as (
          select id, row_number() over (order by dist) as rk
          from (
            select id, ${cosineDistance(cnae.embedding, queryVector)} as dist
            from ${cnae}
            where embedding is not null
            order by dist
            limit ${sql.raw(String(candidates))}
          ) ranked
        )
        select
          c.id, c.descricao,
          c.secao_id as "secaoId", c.secao_descricao as "secaoDescricao",
          coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
            + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
        from bm
        full outer join vec on bm.id = vec.id
        join ${cnae} c on c.id = coalesce(bm.id, vec.id)
        order by score desc, c.id
        limit ${sql.raw(String(limit))}
      `).pipe(Effect.map(({ rows }) => rows));
    }).pipe(
        Effect.catchTag("EffectDrizzleQueryError", (cause) =>
          Effect.fail(DbError.make({ code: "db.QUERY", cause: String(cause) }))
        )
      );

  const listByLevel = (codigo: string) =>
    Effect.gen(function* () {
      const detected = detectLevel(codigo);
      return yield* Match.value(detected).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(CnaeError.make({ code: "cnae.LEVEL_UNRECOGNIZED", codigo }))
        ),
        Match.orElse(({ nivel, value }) =>
          Effect.gen(function* () {
            const subclasses = yield* db.query.cnae.findMany({
              where: whereForLevel(nivel, value),
              columns: { id: true, descricao: true },
              orderBy: (c, { asc }) => asc(c.id),
            });
            return {
              nivel,
              codigo: value,
              total: subclasses.length,
              subclasses,
            };
          })
        )
      );
    }).pipe(
        Effect.catchTag("EffectDrizzleQueryError", (cause) =>
          Effect.fail(DbError.make({ code: "db.QUERY", cause: String(cause) }))
        )
      );

  const index = Effect.gen(function* () {
    const flat = yield* fetchSubclasses;
    const embeddings = yield* embedder.embed(
      "passage",
      pipe(flat, Arr.map(subclassePassage))
    );
    const rows = Arr.zipWith(flat, embeddings, (row, embedding) => ({
      ...row,
      embedding,
    }));
    yield* replaceAll(rows);
    return rows.length;
  });

  return { index, indexAll: index, resolve, search, listByLevel };
});

export class Cnae extends Context.Service<
  Cnae,
  Effect.Success<typeof makeCnae>
>()("dados-publicos-mcp/sources/cnae/store/Cnae") {}

export const CnaeLive = Layer.effect(Cnae)(makeCnae);
