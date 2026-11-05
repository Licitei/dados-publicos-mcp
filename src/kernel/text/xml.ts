import { Option } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";

export const group: {
  (index: number): (match: RegExpMatchArray) => string;
  (match: RegExpMatchArray, index: number): string;
} = dual(2, (match: RegExpMatchArray, index: number) =>
  pipe(
    Arr.get(match, index),
    Option.flatMap(Option.fromNullishOr),
    Option.getOrElse(() => "")
  )
);

export const matchesOf = (pattern: RegExp) => (input: string) =>
  pipe(input, Str.matchAll(pattern), Arr.fromIterable);

const replaceMatches =
  (pattern: RegExp, replacer: (match: RegExpMatchArray) => string) => (input: string) => {
    const tail = pipe(
      matchesOf(pattern)(input),
      Arr.reduce({ out: "", cursor: 0 }, (acc, match) => {
        const start = match.index ?? 0;
        return {
          out: acc.out + pipe(input, Str.slice(acc.cursor, start)) + replacer(match),
          cursor: start + group(match, 0).length,
        };
      })
    );
    return tail.out + pipe(input, Str.slice(tail.cursor));
  };

export const decodeXmlEntities = (value: string) =>
  pipe(
    value,
    Str.replace(/&lt;/g, "<"),
    Str.replace(/&gt;/g, ">"),
    Str.replace(/&quot;/g, '"'),
    Str.replace(/&apos;/g, "'"),
    replaceMatches(/&#x([0-9a-fA-F]+);/g, (match) =>
      String.fromCodePoint(parseInt(group(match, 1), 16))
    ),
    replaceMatches(/&#(\d+);/g, (match) => String.fromCodePoint(parseInt(group(match, 1), 10))),
    Str.replace(/&amp;/g, "&")
  );
