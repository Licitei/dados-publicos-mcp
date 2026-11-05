import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
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

const makeCnae = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    const rows = yield* fetchSubclasses;
    const loaded = yield* duck.replace(cnaeTable, rows);
    yield* fuzzy.write(
      "cnae",
      Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
    );
    return loaded;
  });

  return { index };
});

export class Cnae extends Context.Service<Cnae, Effect.Success<typeof makeCnae>>()(
  "dados-publicos-mcp/sources/cnae/store/Cnae"
) {}

export const CnaeLive = Layer.effect(Cnae)(makeCnae);
