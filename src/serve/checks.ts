import { Schema } from "effect";

export const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));

export const positiveIntMax = (max: number) =>
  Schema.Finite.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(max))
  );
