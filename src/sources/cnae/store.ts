import { Context, Effect, Layer, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { bm25, Duck, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { preferExact } from "../../kernel/duck/search";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { CnaeError, levelByDigits, secaoNivel, SubclasseFlat, type CnaeNivel } from "./catalog";
import { fetchSubclasses } from "./indexer";

export const cnaeTable: DuckTable = {
  name: "cnae",
  key: "id",
  columns: {
    id: "VARCHAR",
    descricao: "VARCHAR",
    classeId: "VARCHAR",
    classeDescricao: "VARCHAR",
    grupoId: "VARCHAR",
    grupoDescricao: "VARCHAR",
    divisaoId: "VARCHAR",
    divisaoDescricao: "VARCHAR",
    secaoId: "VARCHAR",
    secaoDescricao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const SearchHit = Schema.Struct({
  id: Schema.String,
  descricao: Schema.String,
  secaoId: Schema.String,
  secaoDescricao: Schema.String,
  score: Schema.Finite,
});

const Listed = Schema.Struct({ id: Schema.String, descricao: Schema.String });

const defaultLimit = 10;
const maxLimit = 50;

const levelColumn = (nivel: CnaeNivel) =>
  Match.value(nivel).pipe(
    Match.when("secao", () => "secaoId"),
    Match.when("divisao", () => "divisaoId"),
    Match.when("grupo", () => "grupoId"),
    Match.when("classe", () => "classeId"),
    Match.when("subclasse", () => "id"),
    Match.exhaustive
  );

const detectLevel = (codigo: string) => {
  const trimmed = Str.trim(codigo);
  return /^[A-Za-z]$/.test(trimmed)
    ? Option.some({ nivel: secaoNivel, value: Str.toUpperCase(trimmed) })
    : pipe(
        Option.fromNullishOr(levelByDigits.get(onlyDigits(trimmed).length)),
        Option.map((nivel) => ({ nivel, value: onlyDigits(trimmed) }))
      );
};

const makeCnae = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const resolve = (codigo: string) =>
    Effect.gen(function* () {
      const normalizado = onlyDigits(codigo);
      const rows = yield* duck.query(SubclasseFlat, `SELECT * FROM cnae WHERE id = ?`, [
        normalizado,
      ]);
      const row = yield* Effect.fromOption(Arr.head(rows)).pipe(
        Effect.mapError(() => CnaeError.make({ code: "cnae.NOT_FOUND", codigo, normalizado }))
      );
      return {
        subclasse: { id: row.id, descricao: row.descricao },
        classe: { id: row.classeId, descricao: row.classeDescricao },
        grupo: { id: row.grupoId, descricao: row.grupoDescricao },
        divisao: { id: row.divisaoId, descricao: row.divisaoDescricao },
        secao: { id: row.secaoId, descricao: row.secaoDescricao },
      };
    });

  const search = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const limit = Math.min(Math.max(options?.limit ?? defaultLimit, 1), maxLimit);
      const exact = yield* duck.query(
        SearchHit,
        `SELECT id, descricao, "secaoId", "secaoDescricao", score
         FROM (SELECT *, ${bm25(cnaeTable)} AS score FROM cnae)
         WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT ?`,
        [normalize(termo), limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("cnae", normalize(termo), { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            SearchHit,
            `SELECT id, descricao, "secaoId", "secaoDescricao", 0::DOUBLE AS score FROM cnae WHERE ${inIds("id")}`,
            [idsParam(ids)]
          )
        : [];
      return preferExact(exact, ids, approximate, (row) => row.id);
    });

  const listByLevel = (codigo: string) =>
    Effect.gen(function* () {
      const { nivel, value } = yield* Effect.fromOption(detectLevel(codigo)).pipe(
        Effect.mapError(() => CnaeError.make({ code: "cnae.LEVEL_UNRECOGNIZED", codigo }))
      );
      const subclasses = yield* duck.query(
        Listed,
        `SELECT id, descricao FROM cnae WHERE "${levelColumn(nivel)}" = ? ORDER BY id`,
        [value]
      );
      return { nivel, codigo: value, total: subclasses.length, subclasses };
    });

  const index = Effect.gen(function* () {
    const rows = yield* fetchSubclasses;
    const loaded = yield* duck.replace(cnaeTable, rows);
    yield* fuzzy.write(
      "cnae",
      Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
    );
    return loaded;
  });

  return { index, indexAll: index, resolve, search, listByLevel };
});

export class Cnae extends Context.Service<Cnae, Effect.Success<typeof makeCnae>>()(
  "dados-publicos-mcp/sources/cnae/store/Cnae"
) {}

export const CnaeLive = Layer.effect(Cnae)(makeCnae);
