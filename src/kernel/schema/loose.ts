import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";

export const looseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite]))
);

export const looseString = Schema.optional(Schema.NullOr(Schema.String));

export const looseFlag = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]))
);

export type Loose = string | number | boolean | null | undefined;

export const toStringOrNull = (value: Loose) => {
  const text = value === null || value === undefined ? "" : Str.trim(String(value));
  return text === "" ? null : text;
};

export const toIntOrNull = (value: Loose) => {
  const text = toStringOrNull(value);
  const parsed = text === null ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

export const toRealOrNull = (value: Loose) => {
  const text = toStringOrNull(value);
  const parsed = text === null ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toBool = (value: Loose) =>
  typeof value === "boolean"
    ? value
    : typeof value === "string"
      ? pipe(value, Str.trim, Str.toLowerCase) === "true"
      : Boolean(value);

export const joinText = (parts: readonly Loose[]) =>
  pipe(
    parts,
    Arr.map(toStringOrNull),
    Arr.filter((part) => part !== null),
    Arr.join(" ")
  );
