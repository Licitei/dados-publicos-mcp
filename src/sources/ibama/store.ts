import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { replaceSearch } from "../../kernel/search/index-rows";
import { ibamaTables, type IbamaDataset } from "./catalog";
import { loadIbama } from "./indexer";

const makeIbama = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const datasets: readonly IbamaDataset[] = ["auto_infracao", "termo_embargo"];
  const index = Effect.gen(function* () {
    const batches = yield* Effect.forEach(
      datasets,
      (dataset) =>
        loadIbama(dataset).pipe(Effect.map((rows) => ({ table: ibamaTables[dataset], rows }))),
      { concurrency: 1 }
    );
    const counts = yield* duck.transaction(
      Effect.forEach(batches, (batch) => replaceSearch(batch.table, batch.rows), { concurrency: 1 })
    );
    return Arr.reduce(counts, 0, (sum, count) => sum + count);
  }).pipe(
    Effect.provideService(Http, http),
    Effect.provideService(Duck, duck),
    Effect.provideService(Fuzzy, fuzzy)
  );
  return { index };
});
export class Ibama extends Context.Service<Ibama, Effect.Success<typeof makeIbama>>()(
  "dados-publicos-mcp/sources/ibama/store/Ibama"
) {}
export const IbamaLive = Layer.effect(Ibama)(makeIbama);
