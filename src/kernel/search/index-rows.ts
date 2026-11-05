import * as Predicate from "effect/Predicate";
import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import { Duck, quoteIdentifier, type DuckTable } from "../duck/duck";
import { normalize } from "../text/normalize";
import { Fuzzy } from "./fuzzy";

const Row = Schema.Record(Schema.String, Schema.Unknown);
type Rows = readonly (typeof Row)["Type"][];

const searchText = (value: unknown) => (Predicate.isString(value) ? value : "");

const replace = (table: DuckTable, rows: Rows) =>
  Effect.gen(function* () {
    const duck = yield* Duck;
    const fuzzy = yield* Fuzzy;
    const count = yield* duck.replace(table, rows);
    yield* fuzzy.write(
      table.name,
      Arr.map(rows, (row): readonly [string, string] => [
        String(row[table.key]),
        normalize(
          Arr.join(
            Arr.map(table.search ?? [], (column) => searchText(row[column])),
            " "
          )
        ),
      ])
    );
    return count;
  });

export const replaceSearch: {
  (rows: Rows): (table: DuckTable) => ReturnType<typeof replace>;
  (table: DuckTable, rows: Rows): ReturnType<typeof replace>;
} = dual(2, replace);

export const refreshSearch = (table: DuckTable) =>
  Effect.gen(function* () {
    const duck = yield* Duck;
    const fuzzy = yield* Fuzzy;
    const fields = table.search ?? [];
    yield* fields.length === 0
      ? Effect.void
      : duck
          .query(
            Schema.Struct({ id: Schema.String, text: Schema.String }),
            `SELECT CAST(${quoteIdentifier(table.key)} AS VARCHAR) AS id, concat_ws(' ', ${Arr.join(Arr.map(fields, quoteIdentifier), ", ")}) AS text FROM ${quoteIdentifier(table.name)}`
          )
          .pipe(
            Effect.flatMap((rows) =>
              fuzzy.write(
                table.name,
                Arr.map(rows, (row): readonly [string, string] => [row.id, normalize(row.text)])
              )
            )
          );
  });
