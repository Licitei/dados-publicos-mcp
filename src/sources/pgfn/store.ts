import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Http } from "../../kernel/http/client";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { pgfnTable, pgfnNaoPrevidenciarioTable, type PgfnDataset } from "./catalog";
import { indexPgfn } from "./indexer";

const makePgfn = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const indexDatasets = (heavy: boolean, datasets: readonly PgfnDataset[]) =>
    Effect.gen(function* () {
      const table = heavy ? pgfnNaoPrevidenciarioTable : pgfnTable;
      const count = yield* duck.transaction(
        indexPgfn({ heavy, datasets }).pipe(
          Effect.provideService(Http, http),
          Effect.provideService(Duck, duck)
        )
      );
      yield* duck.reindex(table);
      const rows = yield* duck.query(
        Schema.Struct({ id: Schema.String, busca: Schema.String }),
        `SELECT id, busca FROM ${table.name}`
      );
      yield* fuzzy.write(
        table.name,
        Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
      );
      return count;
    });
  return {
    index: indexDatasets(false, ["previdenciario", "fgts"]),
    indexNaoPrevidenciario: indexDatasets(true, ["nao_previdenciario"]),
  };
});
export class Pgfn extends Context.Service<Pgfn, Effect.Success<typeof makePgfn>>()(
  "dados-publicos-mcp/sources/pgfn/store/Pgfn"
) {}
export const PgfnLive = Layer.effect(Pgfn)(makePgfn);
