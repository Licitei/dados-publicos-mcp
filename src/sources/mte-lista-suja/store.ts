import { Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { replaceSearch } from "../../kernel/search/index-rows";
import { listaSujaTable } from "./catalog";
import { loadListaSuja } from "./indexer";

const makeListaSuja = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const index = loadListaSuja.pipe(
    Effect.provideService(Http, http),
    Effect.flatMap((rows) => replaceSearch(listaSujaTable, rows)),
    Effect.provideService(Duck, duck),
    Effect.provideService(Fuzzy, fuzzy)
  );
  return { index };
});
export class ListaSuja extends Context.Service<ListaSuja, Effect.Success<typeof makeListaSuja>>()(
  "dados-publicos-mcp/sources/mte-lista-suja/store/ListaSuja"
) {}
export const ListaSujaLive = Layer.effect(ListaSuja)(makeListaSuja);
