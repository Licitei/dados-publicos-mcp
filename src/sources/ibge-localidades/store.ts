import { Context, Effect, Layer, Match, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import {
  bm25,
  Duck,
  type DuckParam,
  type DuckTable,
  idsParam,
  inIds,
} from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { IbgeError, MunicipioFlat, codigoIbgeLength, ufBySigla } from "./catalog";
import { fetchMunicipios } from "./indexer";

export const municipioTable: DuckTable = {
  name: "municipio",
  key: "id",
  columns: {
    id: "VARCHAR",
    nome: "VARCHAR",
    nomeNormalizado: "VARCHAR",
    ufSigla: "VARCHAR",
    ufId: "INTEGER",
    ufNome: "VARCHAR",
    mesorregiaoId: "INTEGER",
    mesorregiaoNome: "VARCHAR",
    regiaoSigla: "VARCHAR",
  },
  search: ["nomeNormalizado"],
};

const MunicipioScored = Schema.Struct({ ...MunicipioFlat.fields, score: Schema.Finite });

const municipioColumns = `id, nome, "nomeNormalizado", "ufSigla", "ufId"::INTEGER AS "ufId", "ufNome",
  "mesorregiaoId"::INTEGER AS "mesorregiaoId", "mesorregiaoNome", "regiaoSigla"`;

const defaultLimit = 10;

const makeIbgeLocalidades = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const validateUf = (sigla: string) =>
    Match.value(ufBySigla.get(pipe(sigla, Str.trim, Str.toUpperCase))).pipe(
      Match.when(Match.undefined, () =>
        Effect.fail(IbgeError.make({ code: "ibge.UF_INVALID", uf: sigla }))
      ),
      Match.orElse((uf) => Effect.succeed(uf))
    );

  const resolveMunicipio = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const ufFilter = yield* Match.value(options?.uf).pipe(
        Match.when(Match.string, (uf) => validateUf(uf).pipe(Effect.map((found) => found.sigla))),
        Match.orElse(() => Effect.undefined)
      );
      const normalized = normalize(termo);
      const limit = Math.min(Math.max(Math.trunc(options?.limit ?? defaultLimit), 1), 50);
      const ufClause = Match.value(ufFilter).pipe(
        Match.when(Match.string, () => `"ufSigla" = ?`),
        Match.orElse(() => `true`)
      );
      const ufParams: readonly DuckParam[] = Match.value(ufFilter).pipe(
        Match.when(Match.string, (uf): readonly DuckParam[] => [uf]),
        Match.orElse((): readonly DuckParam[] => [])
      );
      const exact = yield* duck.query(
        MunicipioScored,
        `SELECT ${municipioColumns}, score
         FROM (SELECT *, ${bm25(municipioTable)} AS score FROM municipio)
         WHERE score IS NOT NULL AND ${ufClause} ORDER BY score DESC, id LIMIT ?`,
        [normalized, ...ufParams, limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("municipio", normalized, { limit: 50 });
      const candidates = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            MunicipioScored,
            `SELECT ${municipioColumns}, 0::DOUBLE AS score FROM municipio WHERE ${inIds("id")} AND ${ufClause}`,
            [idsParam(ids), ...ufParams]
          )
        : [];
      const matched = Arr.isReadonlyArrayNonEmpty(exact)
        ? exact
        : Arr.take(
            Arr.getSomes(Arr.map(ids, (id) => Arr.findFirst(candidates, (row) => row.id === id))),
            limit
          );
      const rows = Arr.isReadonlyArrayNonEmpty(matched)
        ? matched
        : yield* duck.query(
            MunicipioScored,
            `SELECT ${municipioColumns}, 0::DOUBLE AS score FROM municipio WHERE ${ufClause} ORDER BY id LIMIT ?`,
            [...ufParams, limit]
          );
      return yield* Match.value(rows.length).pipe(
        Match.when(0, () =>
          Effect.fail(IbgeError.make({ code: "ibge.MUNICIPIO_NOT_FOUND", termo, uf: ufFilter }))
        ),
        Match.orElse(() => Effect.succeed(rows))
      );
    });

  const municipioByCodigo = (codigo: string) =>
    Effect.gen(function* () {
      const normalizado = pipe(onlyDigits(codigo), Str.padStart(codigoIbgeLength, "0"));
      const found = yield* duck.query(
        MunicipioFlat,
        `SELECT ${municipioColumns} FROM municipio WHERE id = ?`,
        [normalizado]
      );
      return yield* Effect.fromOption(Arr.head(found)).pipe(
        Effect.mapError(() => IbgeError.make({ code: "ibge.CODE_NOT_FOUND", codigo, normalizado }))
      );
    });

  const listByUf = (uf: string) =>
    Effect.gen(function* () {
      const validated = yield* validateUf(uf);
      const municipios = yield* duck.query(
        MunicipioFlat,
        `SELECT ${municipioColumns} FROM municipio WHERE "ufSigla" = ? ORDER BY "nomeNormalizado", id`,
        [validated.sigla]
      );
      return { uf: validated.sigla, ufId: validated.id, total: municipios.length, municipios };
    });

  const index = Effect.gen(function* () {
    const flat = yield* fetchMunicipios;
    const loaded = yield* duck.replace(municipioTable, flat);
    yield* fuzzy.write(
      "municipio",
      Arr.map(flat, (row): readonly [string, string] => [row.id, row.nomeNormalizado])
    );
    return loaded;
  });

  return { index, indexAll: index, resolveMunicipio, municipioByCodigo, validateUf, listByUf };
});

export class IbgeLocalidades extends Context.Service<
  IbgeLocalidades,
  Effect.Success<typeof makeIbgeLocalidades>
>()("dados-publicos-mcp/sources/ibge-localidades/store/IbgeLocalidades") {}

export const IbgeLocalidadesLive = Layer.effect(IbgeLocalidades)(makeIbgeLocalidades);
