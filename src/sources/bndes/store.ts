import { Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { replaceSearch } from "../../kernel/search/index-rows";
import { bndesOperacaoTable, bndesEnteTable } from "./catalog";
import { loadBndes } from "./indexer";

const makeBndes = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const index = Effect.gen(function* () {
    const rows = yield* loadBndes;
    return yield* duck.transaction(
      Effect.gen(function* () {
        const operations = yield* replaceSearch(bndesOperacaoTable, rows.operacoes);
        const entities = yield* replaceSearch(bndesEnteTable, rows.entes);
        return operations + entities;
      })
    );
  }).pipe(
    Effect.provideService(Http, http),
    Effect.provideService(Duck, duck),
    Effect.provideService(Fuzzy, fuzzy)
  );
  return { index };
});
export class Bndes extends Context.Service<Bndes, Effect.Success<typeof makeBndes>>()(
  "dados-publicos-mcp/sources/bndes/store/Bndes"
) {}
export const BndesLive = Layer.effect(Bndes)(makeBndes);
