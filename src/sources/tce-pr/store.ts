import { Context, DateTime, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { TcePrError, TcePrYears, tcePrTable } from "./catalog";
import { indexTcePr } from "./indexer";

const makeTcePr = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const indexYears = (input: unknown) =>
    Schema.decodeUnknownEffect(TcePrYears)(input).pipe(
      Effect.mapError(() => TcePrError.make({ code: "tce-pr.SCOPE" })),
      Effect.flatMap((years) =>
        Effect.gen(function* () {
          const count = yield* duck.transaction(
            indexTcePr(years).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            )
          );
          yield* duck.reindex(tcePrTable);
          const rows = yield* duck.query(
            Schema.Struct({ __id: Schema.String, __busca: Schema.String }),
            "SELECT __id, __busca FROM tce_pr_licitacao"
          );
          yield* fuzzy.write(
            tcePrTable.name,
            Arr.map(rows, (row): readonly [string, string] => [row.__id, row.__busca])
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
export class TcePr extends Context.Service<TcePr, Effect.Success<typeof makeTcePr>>()(
  "dados-publicos-mcp/sources/tce-pr/store/TcePr"
) {}
export const TcePrLive = Layer.effect(TcePr)(makeTcePr);
