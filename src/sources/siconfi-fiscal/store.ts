import { Http } from "../../kernel/http/client";
import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { onlyDigits } from "../../kernel/text/normalize";
import { defaultAno, uniaoEnte } from "./catalog";
import { indexEnte } from "./indexer";

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

const FuzzyText = Schema.Struct({ id: Schema.String, busca: Schema.String });

const makeSiconfiFiscal = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const ensureTable = duck.ensure(siconfiFatoTable);

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
      const flat = yield* indexEnte(idEnte, ano).pipe(Effect.provideService(Http, http));
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
    const flat = yield* indexEnte(uniaoEnte, defaultAno).pipe(Effect.provideService(Http, http));
    const rows = Arr.map(flat, (row, position) => ({
      ...row,
      id: `${uniaoEnte}:${defaultAno}:${position}`,
    }));
    const inserted = yield* duck.replace(siconfiFatoTable, rows);
    yield* writeFuzzy;
    return { inserted, total: yield* duck.count(siconfiFatoTable) };
  });

  return { index, indexAno, indexarEnte };
});

export class SiconfiFiscal extends Context.Service<
  SiconfiFiscal,
  Effect.Success<typeof makeSiconfiFiscal>
>()("dados-publicos-mcp/sources/siconfi-fiscal/store/SiconfiFiscal") {}

export const SiconfiFiscalLive = Layer.effect(SiconfiFiscal)(makeSiconfiFiscal);
