import { Effect, Stream } from "effect";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { pageStep, type PageState } from "../../kernel/http/paging";
import {
  catmatMaterialTable,
  CatmatItemPayload,
  catserServiceTable,
  CatserItemPayload,
  endpoints,
  flattenMateriais,
  flattenServicos,
  pageSizes,
  pageUrl,
} from "./catalog";

const fetchServicos = (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(
      pageUrl({
        endpoint: endpoints.catserItem,
        pagina: state.pagina,
        tamanhoPagina: pageSizes.max,
      }),
      CatserItemPayload
    )
  ).pipe(
    Effect.flatMap((page) =>
      appendRows(catserServiceTable, flattenServicos(page.resultado)).pipe(
        Effect.as(
          pageStep(state, { count: page.resultado.length, totalPaginas: page.totalPaginas })
        )
      )
    )
  );

const fetchMateriais = (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(
      pageUrl({
        endpoint: endpoints.catmatItem,
        pagina: state.pagina,
        tamanhoPagina: pageSizes.max,
      }),
      CatmatItemPayload
    )
  ).pipe(
    Effect.flatMap((page) =>
      appendRows(catmatMaterialTable, flattenMateriais(page.resultado)).pipe(
        Effect.as(
          pageStep(state, { count: page.resultado.length, totalPaginas: page.totalPaginas })
        )
      )
    )
  );

export const indexServicos = Stream.paginate({ pagina: 1 }, fetchServicos).pipe(Stream.runDrain);

export const indexMateriais = Stream.paginate({ pagina: 1 }, fetchMateriais).pipe(Stream.runDrain);
