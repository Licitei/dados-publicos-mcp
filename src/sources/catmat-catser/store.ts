import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { catmatMaterialTable, catserServiceTable } from "./catalog";
import { indexMateriais, indexServicos } from "./indexer";

const makeCatmatCatser = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    yield* duck.create(catserServiceTable);
    yield* duck.create(catmatMaterialTable);
    yield* indexServicos;
    yield* indexMateriais;
    yield* duck.reindex(catmatMaterialTable);
    yield* duck.reindex(catserServiceTable);
    yield* Effect.forEach([catmatMaterialTable, catserServiceTable], refreshSearch, {
      concurrency: 1,
    }).pipe(Effect.provideService(Duck, duck), Effect.provideService(Fuzzy, fuzzy));
    return {
      materiais: yield* duck.count(catmatMaterialTable),
      servicos: yield* duck.count(catserServiceTable),
    };
  });

  return { index };
});

export class CatmatCatser extends Context.Service<
  CatmatCatser,
  Effect.Success<typeof makeCatmatCatser>
>()("dados-publicos-mcp/sources/catmat-catser/store/CatmatCatser") {}

export const CatmatCatserLive = Layer.effect(CatmatCatser)(makeCatmatCatser);
