import { Context, Effect, Layer, Match } from "effect";
import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { Db } from "../../kernel/db/client";
import { normalize, onlyDigits } from "../../core/normalize";
import { IbgeError, ufBySigla, type MunicipioFlat } from "./catalog";
import { fetchMunicipios } from "./indexer";

export const municipio = pgTable("municipio", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  nomeNormalizado: text("nome_normalizado").notNull(),
  ufSigla: text("uf_sigla").notNull(),
  ufId: integer("uf_id").notNull(),
  ufNome: text("uf_nome").notNull(),
  mesorregiaoId: integer("mesorregiao_id"),
  mesorregiaoNome: text("mesorregiao_nome"),
  regiaoSigla: text("regiao_sigla").notNull(),
});

export type MunicipioRow = typeof municipio.$inferInsert;

const schemaStatements = [
  sql`create table if not exists ${municipio} (
    id text primary key,
    nome text not null,
    nome_normalizado text not null,
    uf_sigla text not null,
    uf_id integer not null,
    uf_nome text not null,
    mesorregiao_id integer,
    mesorregiao_nome text,
    regiao_sigla text not null
  )`,
  sql`create index if not exists municipio_uf on ${municipio} (uf_sigla)`,
  sql`create index if not exists municipio_nome_trgm on ${municipio} using gin (nome_normalizado gin_trgm_ops)`,
];

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(schemaStatements, (statement) => db.execute(statement), {
    discard: true,
  });
});

const toRow = (flat: MunicipioFlat) =>
  ({
    id: flat.id,
    nome: flat.nome,
    nomeNormalizado: flat.nomeNormalizado,
    ufSigla: flat.ufSigla,
    ufId: flat.ufId,
    ufNome: flat.ufNome,
    mesorregiaoId: flat.mesorregiaoId,
    mesorregiaoNome: flat.mesorregiaoNome,
    regiaoSigla: flat.regiaoSigla,
  }) satisfies MunicipioRow;

export const replaceAll = (rows: readonly MunicipioRow[]) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.delete(municipio);
    yield* Match.value(rows.length).pipe(
      Match.when(0, () => Effect.void),
      Match.orElse(() => db.insert(municipio).values([...rows]))
    );
  });

const defaultLimit = 10;

const makeIbgeLocalidades = Effect.gen(function* () {
  const db = yield* Db;

  yield* createSchema;

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
      const score = sql<number>`similarity(${municipio.nomeNormalizado}, ${normalized})`;
      const where = Match.value(ufFilter).pipe(
        Match.when(Match.string, (uf) => eq(municipio.ufSigla, uf)),
        Match.orElse(() => undefined)
      );
      const rows = yield* db
        .select({
          codigoIbge: municipio.id,
          nome: municipio.nome,
          uf: municipio.ufSigla,
          ufId: municipio.ufId,
          ufNome: municipio.ufNome,
          mesorregiao: municipio.mesorregiaoNome,
          regiao: municipio.regiaoSigla,
          score,
        })
        .from(municipio)
        .where(where)
        .orderBy(sql`${score} desc`, municipio.id)
        .limit(limit);
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
      const normalizado = onlyDigits(codigo).padStart(7, "0");
      const rows = yield* db
        .select({
          codigoIbge: municipio.id,
          nome: municipio.nome,
          uf: municipio.ufSigla,
          ufId: municipio.ufId,
          ufNome: municipio.ufNome,
          mesorregiao: municipio.mesorregiaoNome,
          regiao: municipio.regiaoSigla,
        })
        .from(municipio)
        .where(eq(municipio.id, normalizado))
        .limit(1);
      return yield* Match.value(rows[0]).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new IbgeError({ code: "ibge.CODE_NOT_FOUND", codigo, normalizado })
          )
        ),
        Match.orElse((found) => Effect.succeed(found))
      );
    });

  const listByUf = (uf: string) =>
    Effect.gen(function* () {
      const validated = yield* validateUf(uf);
      const rows = yield* db
        .select({
          codigoIbge: municipio.id,
          nome: municipio.nome,
          uf: municipio.ufSigla,
          ufId: municipio.ufId,
          ufNome: municipio.ufNome,
          mesorregiao: municipio.mesorregiaoNome,
          regiao: municipio.regiaoSigla,
        })
        .from(municipio)
        .where(eq(municipio.ufSigla, validated.sigla))
        .orderBy(municipio.nomeNormalizado, municipio.id);
      return {
        uf: validated.sigla,
        ufId: validated.id,
        total: rows.length,
        municipios: rows,
      };
    });

  const index = fetchMunicipios.pipe(
    Effect.map((flat) => flat.map(toRow)),
    Effect.flatMap((rows) => replaceAll(rows).pipe(Effect.as(rows.length)))
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
