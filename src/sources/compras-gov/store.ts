import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { replaceSearch } from "../../kernel/search/index-rows";
import { ComprasError, ComprasScope } from "./catalog";
import { loadCompras } from "./indexer";

const makeComprasGov = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const indexScope = (scope: unknown) =>
    Schema.decodeUnknownEffect(ComprasScope)(scope).pipe(
      Effect.mapError(() => ComprasError.make({ code: "compras.SCOPE" })),
      Effect.flatMap((validated) => loadCompras(validated)),
      Effect.flatMap((batches) =>
        duck.transaction(
          Effect.forEach(batches, (batch) => replaceSearch(batch.table, batch.rows), {
            concurrency: 1,
          })
        )
      ),
      Effect.map((counts) => Arr.reduce(counts, 0, (total, count) => total + count)),
      Effect.provideService(Http, http),
      Effect.provideService(Duck, duck),
      Effect.provideService(Fuzzy, fuzzy)
    );
  return { index: indexScope({}), indexScope };
});
export class ComprasGov extends Context.Service<
  ComprasGov,
  Effect.Success<typeof makeComprasGov>
>()("dados-publicos-mcp/sources/compras-gov/store/ComprasGov") {}
export const ComprasGovLive = Layer.effect(ComprasGov)(makeComprasGov);
