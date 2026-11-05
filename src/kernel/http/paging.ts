import { Match, Option, Schema } from "effect";
import { dual } from "effect/Function";

export const PageState = Schema.Struct({ pagina: Schema.Finite });
export type PageState = (typeof PageState)["Type"];

const maxPaginas = 5_000;

const PageProgress = Schema.Struct({
  pagina: Schema.Finite,
  count: Schema.Finite,
  totalPaginas: Schema.Finite,
  maxPaginas: Schema.Finite,
});

const nextPage: {
  (state: PageState): (stop: boolean) => Option.Option<PageState>;
  (stop: boolean, state: PageState): Option.Option<PageState>;
} = dual(2, (stop: boolean, state: PageState) =>
  Match.value(stop).pipe(
    Match.when(true, () => Option.none<PageState>()),
    Match.orElse(() => Option.some<PageState>({ pagina: state.pagina + 1 }))
  )
);

const reachedLastPage = (progress: (typeof PageProgress)["Type"]) =>
  progress.count === 0 ||
  progress.pagina >= progress.totalPaginas ||
  progress.pagina >= progress.maxPaginas;

const PageTally = Schema.Struct({
  count: Schema.Finite,
  totalPaginas: Schema.Finite,
});

export const pageStep: {
  (tally: (typeof PageTally)["Type"]): (state: PageState) => ReturnType<typeof stepFrom>;
  (state: PageState, tally: (typeof PageTally)["Type"]): ReturnType<typeof stepFrom>;
} = dual(2, stepFrom);

function stepFrom(state: PageState, tally: (typeof PageTally)["Type"]) {
  return [
    [],
    nextPage(reachedLastPage({ pagina: state.pagina, maxPaginas, ...tally }), state),
  ] as const;
}

export const OffsetState = Schema.Struct({ offset: Schema.Finite, page: Schema.Finite });
export type OffsetState = (typeof OffsetState)["Type"];

export const offsetPage: {
  <A>(
    items: readonly A[],
    hasMore: boolean | null | undefined
  ): (state: OffsetState) => readonly [readonly A[], Option.Option<OffsetState>];
  <A>(
    state: OffsetState,
    items: readonly A[],
    hasMore: boolean | null | undefined
  ): readonly [readonly A[], Option.Option<OffsetState>];
} = dual(
  3,
  <A>(state: OffsetState, items: readonly A[], hasMore: boolean | null | undefined) =>
    [
      items,
      Match.value(items.length === 0 || hasMore !== true || state.page >= maxPaginas).pipe(
        Match.when(true, () => Option.none<OffsetState>()),
        Match.orElse(() =>
          Option.some<OffsetState>({
            offset: state.offset + items.length,
            page: state.page + 1,
          })
        )
      ),
    ] as const
);

const PageQuery = Schema.Struct({
  pagina: Schema.Finite,
  tamanhoPagina: Schema.Finite,
  min: Schema.Finite,
  max: Schema.Finite,
});

export const pagedParams = (query: (typeof PageQuery)["Type"]) =>
  new URLSearchParams({
    pagina: String(query.pagina),
    tamanhoPagina: String(Math.min(Math.max(query.tamanhoPagina, query.min), query.max)),
  });
