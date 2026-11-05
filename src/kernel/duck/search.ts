import { Effect } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";

type Id = string | number;
type Ids = readonly Id[];
type KeyOf<A> = (row: A) => Id;

const preferExact: {
  <A>(ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>): (exact: readonly A[]) => readonly A[];
  <A>(exact: readonly A[], ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>): readonly A[];
} = dual(4, <A>(exact: readonly A[], ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>) =>
  Arr.isReadonlyArrayNonEmpty(exact)
    ? exact
    : Arr.getSomes(
        Arr.map(ids, (id) => Arr.findFirst(approximate, (row) => String(keyOf(row)) === String(id)))
      )
);

type Rows<A, E, R> = Effect.Effect<readonly A[], E, R>;
type Approximate<A, E, R> = (ids: Ids) => Rows<A, E, R>;

export const lexicalOrFuzzy: {
  <A, E2, R2, E3, R3>(
    fuzzyIds: Effect.Effect<Ids, E2, R2>,
    approximate: Approximate<A, E3, R3>,
    keyOf: KeyOf<A>
  ): <E, R>(lexical: Rows<A, E, R>) => Rows<A, E | E2 | E3, R | R2 | R3>;
  <A, E, R, E2, R2, E3, R3>(
    lexical: Rows<A, E, R>,
    fuzzyIds: Effect.Effect<Ids, E2, R2>,
    approximate: Approximate<A, E3, R3>,
    keyOf: KeyOf<A>
  ): Rows<A, E | E2 | E3, R | R2 | R3>;
} = dual(
  4,
  <A, E, R, E2, R2, E3, R3>(
    lexical: Rows<A, E, R>,
    fuzzyIds: Effect.Effect<Ids, E2, R2>,
    approximate: Approximate<A, E3, R3>,
    keyOf: KeyOf<A>
  ) =>
    Effect.gen(function* () {
      const exact = yield* lexical;
      const ids = Arr.isReadonlyArrayNonEmpty(exact) ? [] : yield* fuzzyIds;
      const candidates = Arr.isReadonlyArrayNonEmpty(ids) ? yield* approximate(ids) : [];
      return preferExact(exact, ids, candidates, keyOf);
    })
);
