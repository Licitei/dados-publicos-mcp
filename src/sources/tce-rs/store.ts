import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { TceRsError, TceRsYears, tceRsTables } from "./catalog";
import { indexTceRs } from "./indexer";

const makeTceRs = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const indexYears = (input: unknown) =>
    Schema.decodeUnknownEffect(TceRsYears)(input).pipe(
      Effect.mapError(() => TceRsError.make({ code: "tce-rs.SCOPE" })),
      Effect.flatMap((years) =>
        Effect.gen(function* () {
          const count = yield* duck.transaction(
            indexTceRs(years).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            )
          );
          yield* Effect.forEach(
            tceRsTables,
            (table) =>
              duck
                .reindex(table)
                .pipe(
                  Effect.andThen(refreshSearch(table)),
                  Effect.provideService(Duck, duck),
                  Effect.provideService(Fuzzy, fuzzy)
                ),
            { concurrency: 1 }
          );
          return count;
        })
      )
    );
  const index = DateTime.now.pipe(
    Effect.flatMap((now) => indexYears([DateTime.getPartUtc(now, "year")]))
  );
  return { index, indexYears };
});
export class TceRs extends Context.Service<TceRs, Effect.Success<typeof makeTceRs>>()(
  "dados-publicos-mcp/sources/tce-rs/store/TceRs"
) {}
export const TceRsLive = Layer.effect(TceRs)(makeTceRs);
