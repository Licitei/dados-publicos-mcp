import { Effect, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { bm25, type DuckParam, type DuckTable } from "./duck";

export const clamp: {
  (fallback: number, max: number): (value: number | undefined) => number;
  (value: number | undefined, fallback: number, max: number): number;
} = dual(3, (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1 ? fallback : Math.min(Math.trunc(value), max)
);

type Clause = readonly [sql: string, param: DuckParam];

export const clause: {
  (value: Option.Option<DuckParam>): (sql: string) => Option.Option<Clause>;
  (sql: string, value: Option.Option<DuckParam>): Option.Option<Clause>;
} = dual(2, (sql: string, value: Option.Option<DuckParam>) =>
  Option.map(value, (param): Clause => [sql, param])
);

export const conditions = (parts: ReadonlyArray<Option.Option<Clause>>) => {
  const present = Arr.getSomes(parts);
  return {
    sql: Arr.join(
      Arr.map(present, ([sql]) => ` AND ${sql}`),
      ""
    ),
    params: Arr.map(present, ([, param]) => param),
  };
};

type Id = string | number;
type Ids = readonly Id[];
type KeyOf<A> = (row: A) => Id;

export const preferExact: {
  <A>(ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>): (exact: readonly A[]) => readonly A[];
  <A>(exact: readonly A[], ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>): readonly A[];
} = dual(4, <A>(exact: readonly A[], ids: Ids, approximate: readonly A[], keyOf: KeyOf<A>) =>
  Arr.isReadonlyArrayNonEmpty(exact)
    ? exact
    : Arr.getSomes(
        Arr.map(ids, (id) => Arr.findFirst(approximate, (row) => String(keyOf(row)) === String(id)))
      )
);

export const tipoDocumento = (docNormalizado: string) =>
  Match.value(docNormalizado.length).pipe(
    Match.when(14, () => "cnpj" as const),
    Match.when(11, () => "cpf" as const),
    Match.orElse(() => "desconhecido" as const)
  );

const Counts = Schema.Record(Schema.String, Schema.Finite);
type Counts = (typeof Counts)["Type"];

export const countBy: {
  <A>(keyOf: (row: A) => string): (rows: readonly A[]) => Counts;
  <A>(rows: readonly A[], keyOf: (row: A) => string): Counts;
} = dual(2, <A>(rows: readonly A[], keyOf: (row: A) => string) =>
  pipe(
    rows,
    Arr.groupBy(keyOf),
    Rec.map((group) => group.length)
  )
);

export const ufClause = (uf: string | undefined) =>
  clause("uf = ?", Option.map(Option.fromNullishOr(uf), Str.toUpperCase));

export const scoredFrom = (table: DuckTable) =>
  `FROM (SELECT *, ${bm25(table)} AS score FROM ${table.name}) WHERE score IS NOT NULL`;

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

export const castIds = "CAST(id AS VARCHAR) IN (SELECT unnest(string_split(?, chr(31))))";
