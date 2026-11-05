import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Predicate from "effect/Predicate";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import * as Str from "effect/String";

const stripBom = (text: string) =>
  pipe(
    Str.charCodeAt(text, 0),
    Option.filter((code) => code === 0xfeff),
    Option.match({
      onNone: () => text,
      onSome: () => pipe(text, Str.slice(1))
    })
  );

const escapeRegExp = (value: string) =>
  pipe(value, Str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const quoteCount = (value: string) =>
  pipe(
    value,
    Str.match(/"/g),
    Option.match({ onNone: () => 0, onSome: (found) => found.length })
  );

type Merge = {
  readonly merged: readonly string[];
  readonly pending: Option.Option<string>;
};

const mergeQuotedLines = (lines: readonly string[]) => {
  const state = pipe(
    lines,
    Arr.reduce<Merge, string>(
      { merged: [], pending: Option.none() },
      (acc, line) => {
        const combined = pipe(
          acc.pending,
          Option.match({
            onNone: () => line,
            onSome: (pending) => `${pending}\n${line}`
          })
        );
        return quoteCount(combined) % 2 === 0
          ? { merged: Arr.append(acc.merged, combined), pending: Option.none() }
          : { merged: acc.merged, pending: Option.some(combined) };
      }
    )
  );
  return pipe(
    state.pending,
    Option.match({
      onNone: () => state.merged,
      onSome: (trailing) => Arr.append(state.merged, trailing)
    })
  );
};

const unquote = (cell: string) =>
  cell.length >= 2 && pipe(cell, Str.startsWith('"')) && pipe(cell, Str.endsWith('"'))
    ? pipe(cell, Str.slice(1, -1), Str.replace(/""/g, '"'))
    : cell;

const tokenize = (line: string, pattern: RegExp, delimiter: string) =>
  pipe(
    Array.from(pipe(delimiter + line, Str.matchAll(pattern))),
    Arr.map((match) => unquote(match[1] ?? ""))
  );

export type CsvOptions = {
  readonly encoding?: string;
  readonly delimiter?: string;
};

const parseCsvRecordsImpl = (
  bytes: Uint8Array,
  options?: CsvOptions
): readonly Record<string, string>[] => {
  const encoding = options?.encoding ?? "utf-8";
  const delimiter = options?.delimiter ?? ",";
  const text = stripBom(new TextDecoder(encoding, { fatal: false }).decode(bytes));
  const escaped = escapeRegExp(delimiter);
  const pattern = new RegExp(
    `${escaped}("(?:[^"]*(?:""[^"]*)*)"|[^${escaped}]*)`,
    "g"
  );
  const rows = pipe(
    mergeQuotedLines(pipe(text, Str.split(/\r\n|\r|\n/))),
    Arr.filter((line) => line.length > 0),
    Arr.map((line) => tokenize(line, pattern, delimiter))
  );
  const header = pipe(Arr.head(rows), Option.getOrElse((): readonly string[] => []));
  return pipe(
    Arr.drop(rows, 1),
    Arr.map((cells) =>
      pipe(
        header,
        Arr.map((key, index): readonly [string, string] => [
          key,
          pipe(Arr.get(cells, index), Option.getOrElse(() => ""))
        ]),
        Rec.fromEntries
      )
    )
  );
};

export const parseCsvRecords: {
  (options?: CsvOptions): (bytes: Uint8Array) => readonly Record<string, string>[];
  (bytes: Uint8Array, options?: CsvOptions): readonly Record<string, string>[];
} = dual(
  (args) => Predicate.isUint8Array(args[0]),
  (bytes: Uint8Array, options?: CsvOptions) => parseCsvRecordsImpl(bytes, options)
);
