import { Effect, Schema } from "effect";
import { dual } from "effect/Function";
import { HttpError } from "./client";

const missingStatuses: ReadonlySet<number> = new Set([401, 403, 404]);

const isHttpError = Schema.is(HttpError);

const isMissing = (error: unknown) =>
  isHttpError(error) && error.code === "http.STATUS" && missingStatuses.has(error.status ?? -1);

export const tolerateMissing: {
  <A2>(
    empty: A2
  ): <A, E, R>(
    effect: Effect.Effect<A, E | HttpError, R>
  ) => Effect.Effect<A | A2, E | HttpError, R>;
  <A, E, R, A2>(
    effect: Effect.Effect<A, E | HttpError, R>,
    empty: A2
  ): Effect.Effect<A | A2, E | HttpError, R>;
} = dual(2, <A, E, R, A2>(effect: Effect.Effect<A, E | HttpError, R>, empty: A2) =>
  effect.pipe(Effect.catchIf(isMissing, () => Effect.succeed(empty)))
);

export const failMissing: {
  <E2>(
    onMissing: () => E2
  ): <A, E, R>(
    effect: Effect.Effect<A, E | HttpError, R>
  ) => Effect.Effect<A, E | HttpError | E2, R>;
  <A, E, R, E2>(
    effect: Effect.Effect<A, E | HttpError, R>,
    onMissing: () => E2
  ): Effect.Effect<A, E | HttpError | E2, R>;
} = dual(2, <A, E, R, E2>(effect: Effect.Effect<A, E | HttpError, R>, onMissing: () => E2) =>
  effect.pipe(Effect.catchIf(isMissing, () => Effect.fail(onMissing())))
);
