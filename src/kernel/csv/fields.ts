import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import { Schema } from "effect";
import * as Str from "effect/String";

const headerKey = (header: string) =>
  pipe(
    header,
    Str.normalize("NFD"),
    Str.replace(/\p{Diacritic}/gu, ""),
    Str.toLowerCase,
    Str.replace(/\s+/g, " "),
    Str.trim
  );

const CsvRow = Schema.Record(Schema.String, Schema.String);

export const indexByKey = (record: (typeof CsvRow)["Type"]) =>
  new Map(
    pipe(
      Rec.toEntries(record),
      Arr.map(([key, value]): readonly [string, string] => [headerKey(key), value])
    )
  );

export type HeaderIndex = ReturnType<typeof indexByKey>;

export const pickFirst: {
  (candidates: readonly string[]): (byKey: ReadonlyMap<string, string>) => string;
  (byKey: ReadonlyMap<string, string>, candidates: readonly string[]): string;
} = dual(2, (byKey: ReadonlyMap<string, string>, candidates: readonly string[]) =>
  pipe(
    candidates,
    Arr.map((candidate) => pipe(byKey.get(headerKey(candidate)) ?? "", Str.trim)),
    Arr.findFirst((value) => value !== ""),
    Option.getOrElse(() => "")
  )
);

export const pickOne: {
  (candidate: string): (byKey: ReadonlyMap<string, string>) => string;
  (byKey: ReadonlyMap<string, string>, candidate: string): string;
} = dual(2, (byKey: ReadonlyMap<string, string>, candidate: string) =>
  pickFirst(byKey, [candidate])
);

export const numeroBr = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  const normalized = pipe(trimmed, Str.includes(","))
    ? pipe(trimmed, Str.replace(/\./g, ""), Str.replace(",", "."))
    : trimmed;
  const cleaned = pipe(normalized, Str.replace(/[^\d.-]/g, ""));
  const parsed = Number(cleaned);
  return cleaned === "" ||
    cleaned === "-" ||
    cleaned === "." ||
    cleaned === "-." ||
    !Number.isFinite(parsed)
    ? null
    : parsed;
};

export const intBr = (value: string) => {
  const parsed = numeroBr(value);
  return parsed === null ? null : Math.trunc(parsed);
};

export const inteiroOrNull = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  const parsed = Number(trimmed);
  return trimmed === "" || !Number.isInteger(parsed) ? null : parsed;
};

const buildDate = (year: string, month: string, day: string) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  return m < 1 || m > 12 || d < 1 || d > 31 || y < 1
    ? Option.none<string>()
    : Option.some(`${year}-${month}-${day}`);
};

const datePattern = (trimmed: string, pattern: RegExp, order: readonly [number, number, number]) =>
  pipe(
    trimmed,
    Str.match(pattern),
    Option.flatMap((found) =>
      Option.all([Arr.get(found, order[0]), Arr.get(found, order[1]), Arr.get(found, order[2])])
    )
  );

const pad2 = Str.padStart(2, "0");

export const dataBr = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  const compact = datePattern(trimmed, /^(\d{4})(\d{2})(\d{2})$/, [1, 2, 3]).pipe(
    Option.flatMap(([year, month, day]) => buildDate(year, month, day))
  );
  const slashed = datePattern(trimmed, /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/, [3, 2, 1]).pipe(
    Option.flatMap(([year, month, day]) => buildDate(year, pad2(month), pad2(day)))
  );
  const iso = datePattern(trimmed, /^(\d{4})-(\d{2})-(\d{2})$/, [1, 2, 3]).pipe(
    Option.flatMap(([year, month, day]) => buildDate(year, month, day))
  );
  return trimmed === "" || /^0+$/.test(trimmed)
    ? null
    : pipe(
        compact,
        Option.orElse(() => slashed),
        Option.orElse(() => iso),
        Option.getOrNull
      );
};

const sentinels: ReadonlySet<string> = new Set(["#NULO#", "#NULO", "-1", "#NE#", "#NI#"]);

export const pickClean: {
  (candidates: readonly string[]): (byKey: HeaderIndex) => string;
  (byKey: HeaderIndex, candidates: readonly string[]): string;
} = dual(2, (byKey: HeaderIndex, candidates: readonly string[]) => {
  const value = pickFirst(byKey, candidates);
  return sentinels.has(value) ? "" : value;
});
