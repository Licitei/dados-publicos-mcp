import { Effect, Stream } from "effect";
import * as Arr from "effect/Array";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { pageStep, type PageState } from "../../kernel/http/paging";
import {
  ConsultarPayload,
  ativoFlags,
  flatten,
  fornecedorTable,
  pageSizes,
  pageUrl,
} from "./catalog";

const flagStride = 10_000_000;

const fetchAndStore = (ativo: boolean) => (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(
      pageUrl({ pagina: state.pagina, tamanhoPagina: pageSizes.max, ativo }),
      ConsultarPayload
    )
  ).pipe(
    Effect.flatMap((page) => {
      const base = (ativo ? 0 : flagStride) + (state.pagina - 1) * pageSizes.max;
      return appendRows(
        fornecedorTable,
        Arr.map(flatten(page.resultado), (row, position) => ({ id: base + position, ...row }))
      ).pipe(
        Effect.as(
          pageStep(state, { count: page.resultado.length, totalPaginas: page.totalPaginas })
        )
      );
    })
  );

const indexAtivo = (ativo: boolean) =>
  Stream.paginate({ pagina: 1 }, fetchAndStore(ativo)).pipe(Stream.runDrain);

export const indexFornecedores = Effect.forEach(ativoFlags, indexAtivo, {
  concurrency: 1,
  discard: true,
});
