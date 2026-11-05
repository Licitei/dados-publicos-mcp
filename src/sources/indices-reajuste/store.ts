import { Http } from "../../kernel/http/client";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { indiceReajusteTable } from "./catalog";
import { loadIndices } from "./indexer";

const makeIndicesReajuste = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const index = Effect.gen(function* () {
    const rows = yield* loadIndices.pipe(Effect.provideService(Http, http));
    const loaded = yield* duck.replace(indiceReajusteTable, rows);
    yield* fuzzy.write(
      indiceReajusteTable.name,
      Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
    );
    return loaded;
  });
  return { index };
});

export class IndicesReajuste extends Context.Service<
  IndicesReajuste,
  Effect.Success<typeof makeIndicesReajuste>
>()("dados-publicos-mcp/sources/indices-reajuste/store/IndicesReajuste") {}
export const IndicesReajusteLive = Layer.effect(IndicesReajuste)(makeIndicesReajuste);
