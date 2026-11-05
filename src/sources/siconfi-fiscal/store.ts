import { Context, Effect, Layer, Match, Schema, Struct } from "effect";
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
import { defaultAno, uniaoEnte, SiconfiFatoFlat } from "./catalog";
import { indexEnte } from "./indexer";
import { clamp, preferExact } from "../../kernel/duck/search";

export const siconfiFatoTable: DuckTable = {
  name: "siconfi_fato",
  key: "id",
  columns: {
    id: "VARCHAR",
    idEnte: "VARCHAR",
    exercicio: "INTEGER",
    demonstrativo: "VARCHAR",
    anexo: "VARCHAR",
    rotulo: "VARCHAR",
    coluna: "VARCHAR",
    codConta: "VARCHAR",
    conta: "VARCHAR",
    valor: "DOUBLE",
    instituicao: "VARCHAR",
    uf: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const FatoRow = SiconfiFatoFlat.mapFields(Struct.omit(["busca"]));

const FatoScored = Schema.Struct({ ...FatoRow.fields, id: Schema.String, score: Schema.Finite });

const FuzzyText = Schema.Struct({ id: Schema.String, busca: Schema.String });

const fatoColumns = `"idEnte", exercicio, demonstrativo, anexo, rotulo, coluna, "codConta", conta, valor, instituicao, uf`;

const makeSiconfiFiscal = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const ensureTable = duck.ensure(siconfiFatoTable);

  const fiscalPorEnte = (
    idEnteInput: string,
    options?: {
      readonly demonstrativo?: string;
      readonly exercicio?: number;
      readonly limit?: number;
    }
  ) =>
    Effect.gen(function* () {
      const idEnte = onlyDigits(idEnteInput);
      const limit = clamp(options?.limit, 200, 1000);
      const demonstrativoFilter = Match.value(options?.demonstrativo).pipe(
        Match.when(Match.string, (d): readonly [string, readonly DuckParam[]] => [
          `AND demonstrativo = ?`,
          [pipe(d, Str.toUpperCase)],
        ]),
        Match.orElse((): readonly [string, readonly DuckParam[]] => ["", []])
      );
      const exercicioFilter = Match.value(options?.exercicio).pipe(
        Match.when(Match.number, (ano): readonly [string, readonly DuckParam[]] => [
          `AND exercicio = ?`,
          [ano],
        ]),
        Match.orElse((): readonly [string, readonly DuckParam[]] => ["", []])
      );
      return yield* duck.query(
        FatoRow,
        `SELECT ${fatoColumns} FROM siconfi_fato
         WHERE "idEnte" = ? ${demonstrativoFilter[0]} ${exercicioFilter[0]}
         ORDER BY demonstrativo, anexo, "codConta", coluna LIMIT ?`,
        [idEnte, ...demonstrativoFilter[1], ...exercicioFilter[1], limit]
      );
    });

  const buscarConta = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      const exact = yield* duck.query(
        FatoScored,
        `SELECT id, ${fatoColumns}, score
         FROM (SELECT *, ${bm25(siconfiFatoTable)} AS score FROM siconfi_fato)
         WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT ?`,
        [q, limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("siconfi_fato", q, { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            FatoScored,
            `SELECT id, ${fatoColumns}, 0::DOUBLE AS score FROM siconfi_fato WHERE ${inIds("id")}`,
            [idsParam(ids)]
          )
        : [];
      return preferExact(exact, ids, approximate, (row) => row.id);
    });

  const writeFuzzy = duck.query(FuzzyText, `SELECT id, busca FROM siconfi_fato`).pipe(
    Effect.flatMap((rows) =>
      fuzzy.write(
        "siconfi_fato",
        Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
      )
    )
  );

  const indexarEnte = (idEnteInput: string, ano: number) =>
    Effect.gen(function* () {
      const idEnte = onlyDigits(idEnteInput);
      const flat = yield* indexEnte(idEnte, ano);
      const rows = Arr.map(flat, (row, position) => ({
        ...row,
        id: `${idEnte}:${ano}:${position}`,
      }));
      yield* ensureTable;
      yield* duck.run(`DELETE FROM siconfi_fato WHERE "idEnte" = ? AND exercicio = ?`, [
        idEnte,
        ano,
      ]);
      const inserted = yield* duck.append(siconfiFatoTable, rows);
      yield* duck.reindex(siconfiFatoTable);
      yield* writeFuzzy;
      return { idEnte, ano, inserted };
    });

  const indexAno = (ano: number) => indexarEnte(uniaoEnte, ano);

  const index = Effect.gen(function* () {
    const flat = yield* indexEnte(uniaoEnte, defaultAno);
    const rows = Arr.map(flat, (row, position) => ({
      ...row,
      id: `${uniaoEnte}:${defaultAno}:${position}`,
    }));
    const inserted = yield* duck.replace(siconfiFatoTable, rows);
    yield* writeFuzzy;
    return { inserted, total: yield* duck.count(siconfiFatoTable) };
  });

  return { index, indexAno, indexarEnte, fiscalPorEnte, buscarConta };
});

export class SiconfiFiscal extends Context.Service<
  SiconfiFiscal,
  Effect.Success<typeof makeSiconfiFiscal>
>()("dados-publicos-mcp/sources/siconfi-fiscal/store/SiconfiFiscal") {}

export const SiconfiFiscalLive = Layer.effect(SiconfiFiscal)(makeSiconfiFiscal);
