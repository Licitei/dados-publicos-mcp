import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import type { DuckTable } from "../src/kernel/duck/duck";

export const sha256Hex = (text: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).pipe(
    Effect.map((buffer) =>
      Arr.join(
        Arr.map(Arr.fromIterable(new Uint8Array(buffer)), (byte) =>
          Str.padStart(2, "0")(byte.toString(16))
        ),
        ""
      )
    )
  );

export const tablesText = (tables: readonly DuckTable[]) =>
  pipe(
    tables,
    Arr.map(
      (table) =>
        `${table.name}(${table.key})[${Arr.join(table.search ?? [], ",")}]{${pipe(
          Rec.toEntries(table.columns),
          Arr.map(([column, type]) => `${column}:${type}`),
          Arr.join(",")
        )}}`
    ),
    Arr.join("\n")
  );

export const tablesHash = (tables: readonly DuckTable[]) => sha256Hex(tablesText(tables));
