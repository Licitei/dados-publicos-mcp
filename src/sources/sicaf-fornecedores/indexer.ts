import { Effect, Match, Option, Stream } from "effect";
import { Db } from "../../kernel/db/client";
import { fornecedor } from "../../kernel/db/schemas/fornecedor";
import { getJson } from "../../kernel/http/client";
import {
  ConsultarPayload,
  ativoFlags,
  flatten,
  pageSizes,
  pageUrl,
  type FornecedorFlat,
} from "./catalog";

const maxPaginas = 5_000;

const insertPage = (rows: readonly FornecedorFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.flatMap(Db, (db) =>
        db.insert(fornecedor).values([...rows])
      ).pipe(Effect.asVoid)
    )
  );

type PageState = { readonly pagina: number };

const fetchAndStore = (ativo: boolean) => (state: PageState) =>
  getJson(
    pageUrl({ pagina: state.pagina, tamanhoPagina: pageSizes.max, ativo }),
    ConsultarPayload
  ).pipe(
    Effect.flatMap((page) => {
      const stop =
        page.resultado.length === 0 ||
        state.pagina >= page.totalPaginas ||
        state.pagina >= maxPaginas;
      const next = Match.value(stop).pipe(
        Match.when(true, () => Option.none<PageState>()),
        Match.orElse(() => Option.some<PageState>({ pagina: state.pagina + 1 }))
      );
      return insertPage(flatten(page.resultado)).pipe(
        Effect.as([[], next] as const)
      );
    })
  );

const indexAtivo = (ativo: boolean) =>
  Stream.paginate({ pagina: 1 }, fetchAndStore(ativo)).pipe(Stream.runDrain);

export const indexFornecedores = Effect.forEach(ativoFlags, indexAtivo, {
  concurrency: 1,
  discard: true,
});
