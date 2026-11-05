import { pipe } from "effect/Function";
import * as Str from "effect/String";

export const normalize = (value: string) =>
  pipe(
    value,
    Str.normalize("NFD"),
    Str.replace(/\p{Diacritic}/gu, ""),
    Str.toLowerCase,
    Str.replace(/[^\p{Letter}\p{Number}]+/gu, " "),
    Str.trim
  );

export const onlyDigits = (value: string) => pipe(value, Str.replace(/\D/g, ""));
