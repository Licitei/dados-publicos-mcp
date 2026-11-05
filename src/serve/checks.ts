import { Schema } from "effect";

export const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));

export const Uf = Schema.String.pipe(Schema.check(Schema.isBetweenLength(2, 2)));

export const positiveIntMax = (max: number) =>
  Schema.Finite.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(max))
  );

export const intYear = Schema.Finite.pipe(Schema.check(Schema.isInt()));

export const ceapYear = Schema.Finite.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(2008),
    Schema.isLessThanOrEqualTo(2026)
  )
);
