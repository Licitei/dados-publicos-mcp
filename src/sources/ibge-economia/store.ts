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
import { defaultAno } from "./catalog";
import { fetchAno } from "./indexer";
import { clamp, preferExact } from "../../kernel/duck/search";

export const municipioEconomiaTable: DuckTable = {
  name: "municipio_economia",
  key: "codIbge",
  columns: {
    codIbge: "VARCHAR",
    nome: "VARCHAR",
    uf: "VARCHAR",
    ano: "INTEGER",
    populacao: "BIGINT",
    pibMilReais: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const EconomiaRow = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  ano: Schema.Finite,
  populacao: Schema.NullOr(Schema.Finite),
  pibMilReais: Schema.NullOr(Schema.Finite),
  pibPerCapita: Schema.NullOr(Schema.Finite),
});

const EconomiaScored = Schema.Struct({ ...EconomiaRow.fields, score: Schema.Finite });

const economiaColumns = `"codIbge", nome, uf, ano::INTEGER AS ano, populacao::DOUBLE AS populacao,
  "pibMilReais",
  CASE WHEN "pibMilReais" IS NOT NULL AND populacao IS NOT NULL AND populacao > 0
    THEN round("pibMilReais" * 1000.0 / populacao, 2)::DOUBLE ELSE NULL END AS "pibPerCapita"`;

const makeIbgeEconomia = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const economiaPorCodigo = (codIbgeInput: string) =>
    duck.query(
      EconomiaRow,
      `SELECT ${economiaColumns} FROM municipio_economia WHERE "codIbge" = ? ORDER BY ano DESC LIMIT 1`,
      [onlyDigits(codIbgeInput)]
    );

  const buscarMunicipio = (nome: string, limit: number) =>
    Effect.gen(function* () {
      const exact = yield* duck.query(
        EconomiaScored,
        `SELECT ${economiaColumns}, score
         FROM (SELECT *, ${bm25(municipioEconomiaTable)} AS score FROM municipio_economia)
         WHERE score IS NOT NULL ORDER BY score DESC, "codIbge" LIMIT ?`,
        [normalize(nome), limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("municipio_economia", normalize(nome), { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            EconomiaScored,
            `SELECT ${economiaColumns}, 0::DOUBLE AS score FROM municipio_economia WHERE ${inIds("codIbge")}`,
            [idsParam(ids)]
          )
        : [];
      return preferExact(exact, ids, approximate, (row) => row.codIbge);
    });

  const rankingPib = (options: {
    readonly uf?: string;
    readonly ano?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 20, 100);
      const ufFilter = Match.value(options.uf).pipe(
        Match.when(Match.string, (uf): readonly [string, readonly DuckParam[]] => [
          `AND uf = ?`,
          [pipe(uf, Str.toUpperCase)],
        ]),
        Match.orElse((): readonly [string, readonly DuckParam[]] => ["", []])
      );
      const anoFilter = Match.value(options.ano).pipe(
        Match.when(Match.number, (ano): readonly [string, readonly DuckParam[]] => [
          `AND ano = ?`,
          [ano],
        ]),
        Match.orElse((): readonly [string, readonly DuckParam[]] => ["", []])
      );
      return yield* duck.query(
        EconomiaRow,
        `SELECT ${economiaColumns} FROM municipio_economia
         WHERE "pibMilReais" IS NOT NULL ${ufFilter[0]} ${anoFilter[0]}
         ORDER BY "pibMilReais" DESC, "codIbge" LIMIT ?`,
        [...ufFilter[1], ...anoFilter[1], limit]
      );
    });

  const load = (ano: number) =>
    Effect.gen(function* () {
      const rows = yield* fetchAno(ano);
      const inserted = yield* duck.replace(municipioEconomiaTable, rows);
      yield* fuzzy.write(
        "municipio_economia",
        Arr.map(rows, (row): readonly [string, string] => [row.codIbge, row.busca])
      );
      return inserted;
    });

  const index = load(defaultAno).pipe(Effect.map((inserted) => ({ inserted, total: inserted })));

  const indexAno = (ano: number) => load(ano).pipe(Effect.map((inserted) => ({ inserted })));

  return { index, indexAno, economiaPorCodigo, buscarMunicipio, rankingPib };
});

export class IbgeEconomia extends Context.Service<
  IbgeEconomia,
  Effect.Success<typeof makeIbgeEconomia>
>()("dados-publicos-mcp/sources/ibge-economia/store/IbgeEconomia") {}

export const IbgeEconomiaLive = Layer.effect(IbgeEconomia)(makeIbgeEconomia);
