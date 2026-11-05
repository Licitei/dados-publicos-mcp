import { Fuzzy } from "../../kernel/search/fuzzy";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { convenioTable } from "./catalog";
import { indexAll } from "./indexer";

const makeTransferegov = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    yield* duck.create(convenioTable);
    const inserted = yield* indexAll;
    yield* duck.reindex(convenioTable);
    yield* refreshSearch(convenioTable).pipe(
      Effect.provideService(Duck, duck),
      Effect.provideService(Fuzzy, fuzzy)
    );
    return { inserted, total: yield* duck.count(convenioTable) };
  });

  return { index };
});

export class Transferegov extends Context.Service<
  Transferegov,
  Effect.Success<typeof makeTransferegov>
>()("dados-publicos-mcp/sources/transferegov/store/Transferegov") {}

export const TransferegovLive = Layer.effect(Transferegov)(makeTransferegov);
