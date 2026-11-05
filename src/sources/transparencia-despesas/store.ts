import { Http } from "../../kernel/http/client";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { despesaFederalTable, toAnoMes } from "./catalog";
import { defaultAnoMes, indexMes } from "./indexer";

const makeTransparenciaDespesas = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexMesParam = (anoMes: string) =>
    Effect.gen(function* () {
      yield* duck.create(despesaFederalTable);
      const inserted = yield* indexMes(anoMes).pipe(
        Effect.provideService(Http, http),
        Effect.provideService(Duck, duck)
      );
      yield* duck.reindex(despesaFederalTable);
      yield* refreshSearch(despesaFederalTable).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return { anoMes, inserted, total: yield* duck.count(despesaFederalTable) };
    });

  const index = Effect.gen(function* () {
    const anoMes = yield* defaultAnoMes.pipe(
      Effect.provideService(Http, http),
      Effect.provideService(Duck, duck)
    );
    return yield* indexMesParam(anoMes);
  });

  return { index, indexMes: (mes: string) => indexMesParam(toAnoMes(mes)) };
});

export class TransparenciaDespesas extends Context.Service<
  TransparenciaDespesas,
  Effect.Success<typeof makeTransparenciaDespesas>
>()("dados-publicos-mcp/sources/transparencia-despesas/store/TransparenciaDespesas") {}

export const TransparenciaDespesasLive =
  Layer.effect(TransparenciaDespesas)(makeTransparenciaDespesas);
