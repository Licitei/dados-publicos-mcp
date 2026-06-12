import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { cnae } from "../../kernel/db/schemas/cnae";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  CnaeError,
  levelByDigits,
  secaoNivel,
  type CnaeNivel,
  type SubclasseFlat,
} from "./catalog";
import { fetchSubclasses } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(tableDdl(cnae), (statement) => db.execute(statement), {
    discard: true,
  });
});

export const replaceAll = (rows: readonly SubclasseFlat[]) =>
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
  });

const defaultLimit = 10;
const maxLimit = 50;

const detectLevel = (codigo: string) => {
  const trimmed = codigo.trim();
  return Match.value(trimmed).pipe(
    Match.when(
      (value) => /^[A-Za-z]$/.test(value),
      (value) => ({ nivel: secaoNivel, value: value.toUpperCase() })
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
  yield* createSchema;
  const db = yield* Db;

  const resolve = (codigo: string) =>
    Effect.gen(function* () {
      const normalizado = onlyDigits(codigo);
      const found = yield* db.query.cnae.findFirst({
        where: { id: normalizado },
      });
      return yield* Match.value(found).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new CnaeError({ code: "cnae.NOT_FOUND", codigo, normalizado })
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
    });

  const search = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = Math.min(
        Math.max(options?.limit ?? defaultLimit, 1),
        maxLimit
      );
      return yield* db.execute(sql`
        select
          id,
          descricao,
          secao_id as "secaoId",
          secao_descricao as "secaoDescricao",
          -rk as score
        from (
          select id, descricao, secao_id, secao_descricao,
            row_number() over () as rk
          from (
            select id, descricao, secao_id, secao_descricao
            from ${cnae}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) scored
        order by rk
      `);
    });

  const listByLevel = (codigo: string) =>
    Effect.gen(function* () {
      const detected = detectLevel(codigo);
      return yield* Match.value(detected).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(new CnaeError({ code: "cnae.LEVEL_UNRECOGNIZED", codigo }))
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
    });

  const index = fetchSubclasses.pipe(
    Effect.flatMap((flat) => replaceAll(flat).pipe(Effect.as(flat.length)))
  );

  return { index, indexAll: index, resolve, search, listByLevel };
});

export class Cnae extends Context.Service<
  Cnae,
  Effect.Success<typeof makeCnae>
>()("dados-publicos-mcp/Cnae") {}

export const CnaeLive = Layer.effect(Cnae)(makeCnae);
