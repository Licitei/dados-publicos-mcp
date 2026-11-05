import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Http } from "../../kernel/http/client";
import { replaceSearch } from "../../kernel/search/index-rows";
import { portalTables, type PortalDataset } from "./catalog";
import { loadPortal } from "./indexer";

const makePortalTransparencia = Effect.gen(function* () {
  const http = yield* Http;
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const indexDatasets = (datasets: readonly PortalDataset[], mes?: string) =>
    Effect.gen(function* () {
      const counts = yield* Effect.forEach(
        datasets,
        (dataset) =>
          loadPortal({ dataset, ...(mes === undefined ? {} : { mes }) }).pipe(
            Effect.provideService(Http, http),
            Effect.flatMap((rows) => replaceSearch(portalTables[dataset], rows))
          ),
        { concurrency: 1 }
      );
      return Arr.reduce(counts, 0, (total, count) => total + count);
    }).pipe(Effect.provideService(Duck, duck), Effect.provideService(Fuzzy, fuzzy));
  const light: readonly PortalDataset[] = ["pep", "cpgf", "emendas-parlamentares"];
  return {
    index: indexDatasets(light),
    indexMonth: (mes: string) => indexDatasets(light, mes),
    indexSiape: indexDatasets(["servidores"]),
    indexSiapeMonth: (mes: string) => indexDatasets(["servidores"], mes),
  };
});
export class PortalTransparencia extends Context.Service<
  PortalTransparencia,
  Effect.Success<typeof makePortalTransparencia>
>()("dados-publicos-mcp/sources/portal-transparencia/store/PortalTransparencia") {}
export const PortalTransparenciaLive = Layer.effect(PortalTransparencia)(makePortalTransparencia);
