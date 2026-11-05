import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { indexCmed } from "./indexer";

export const medicamentoCmedTable: DuckTable = {
  name: "medicamento_cmed",
  key: "id",
  columns: {
    id: "VARCHAR",
    substancia: "VARCHAR",
    cnpj: "VARCHAR",
    docNormalizado: "VARCHAR",
    laboratorio: "VARCHAR",
    ggrem: "VARCHAR",
    registro: "VARCHAR",
    ean1: "VARCHAR",
    produto: "VARCHAR",
    apresentacao: "VARCHAR",
    classeTerapeutica: "VARCHAR",
    tarja: "VARCHAR",
    pfSemImpostos: "DOUBLE",
    pmvgSemImpostos: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const makeCmed = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    const flat = yield* indexCmed;
    const rows = Arr.map(flat, (row, position) => ({ ...row, id: String(position) }));
    const inserted = yield* duck.replace(medicamentoCmedTable, rows);
    yield* fuzzy.write(
      "medicamento_cmed",
      Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(medicamentoCmedTable) };
  });

  return { index };
});

export class CmedAnvisa extends Context.Service<CmedAnvisa, Effect.Success<typeof makeCmed>>()(
  "dados-publicos-mcp/sources/cmed-anvisa/store/CmedAnvisa"
) {}

export const CmedAnvisaLive = Layer.effect(CmedAnvisa)(makeCmed);
