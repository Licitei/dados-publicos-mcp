import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { municipio } from "../../kernel/db/schemas/municipio";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  IbgeError,
  codigoIbgeLength,
  ufBySigla,
  type MunicipioFlat,
} from "./catalog";
import { fetchMunicipios } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(tableDdl(municipio), (statement) => db.execute(statement), {
    discard: true,
  });
});

export const replaceAll = (rows: readonly MunicipioFlat[]) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(municipio);
        yield* Match.value(rows.length).pipe(
          Match.when(0, () => Effect.void),
          Match.orElse(() => tx.insert(municipio).values([...rows]))
        );
      })
    );
  });

const defaultLimit = 10;

const makeIbgeLocalidades = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const validateUf = (sigla: string) =>
    Match.value(ufBySigla.get(sigla.trim().toUpperCase())).pipe(
      Match.when(Match.undefined, () =>
        Effect.fail(new IbgeError({ code: "ibge.UF_INVALID", uf: sigla }))
      ),
      Match.orElse((uf) => Effect.succeed(uf))
    );

  const resolveMunicipio = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const ufFilter = yield* Match.value(options?.uf).pipe(
        Match.when(Match.string, (uf) =>
          validateUf(uf).pipe(Effect.map((found) => found.sigla))
        ),
        Match.orElse(() => Effect.succeed(undefined))
      );
      const normalized = normalize(termo);
      const limit = options?.limit ?? defaultLimit;
      const where = Match.value(ufFilter).pipe(
        Match.when(Match.string, (uf) => ({ ufSigla: uf })),
        Match.orElse(() => undefined)
      );
      const rows = yield* db.query.municipio.findMany({
        where,
        extras: {
          score: (m) =>
            sql<number>`similarity(${m.nomeNormalizado}, ${normalized})`.as(
              "score"
            ),
        },
        orderBy: (m, { desc, asc }) => [
          desc(sql`similarity(${m.nomeNormalizado}, ${normalized})`),
          asc(m.id),
        ],
        limit,
      });
      return yield* Match.value(rows.length).pipe(
        Match.when(0, () =>
          Effect.fail(
            new IbgeError({
              code: "ibge.MUNICIPIO_NOT_FOUND",
              termo,
              uf: ufFilter,
            })
          )
        ),
        Match.orElse(() => Effect.succeed(rows))
      );
    });

  const municipioByCodigo = (codigo: string) =>
    Effect.gen(function* () {
      const normalizado = onlyDigits(codigo).padStart(codigoIbgeLength, "0");
      const found = yield* db.query.municipio.findFirst({
        where: { id: normalizado },
      });
      return yield* Match.value(found).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new IbgeError({ code: "ibge.CODE_NOT_FOUND", codigo, normalizado })
          )
        ),
        Match.orElse((row) => Effect.succeed(row))
      );
    });

  const listByUf = (uf: string) =>
    Effect.gen(function* () {
      const validated = yield* validateUf(uf);
      const municipios = yield* db.query.municipio.findMany({
        where: { ufSigla: validated.sigla },
        orderBy: (m, { asc }) => [asc(m.nomeNormalizado), asc(m.id)],
      });
      return {
        uf: validated.sigla,
        ufId: validated.id,
        total: municipios.length,
        municipios,
      };
    });

  const index = fetchMunicipios.pipe(
    Effect.flatMap((flat) => replaceAll(flat).pipe(Effect.as(flat.length)))
  );

  return {
    index,
    indexAll: index,
    resolveMunicipio,
    municipioByCodigo,
    validateUf,
    listByUf,
  };
});

export class IbgeLocalidades extends Context.Service<
  IbgeLocalidades,
  Effect.Success<typeof makeIbgeLocalidades>
>()("dados-publicos-mcp/IbgeLocalidades") {}

export const IbgeLocalidadesLive = Layer.effect(IbgeLocalidades)(
  makeIbgeLocalidades
);
