import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import { Duck, type DuckTable } from "./duck";

const AppendRow = Schema.Record(Schema.String, Schema.Unknown);
type AppendRows = readonly (typeof AppendRow)["Type"][];

const chunkSize = 10_000;

export const appendRows: {
  (rows: AppendRows): (table: DuckTable) => ReturnType<typeof appendTo>;
  (table: DuckTable, rows: AppendRows): ReturnType<typeof appendTo>;
} = dual(2, appendTo);

function appendTo(table: DuckTable, rows: AppendRows) {
  return Effect.flatMap(Duck, (duck) =>
    Effect.forEach(Arr.chunksOf(rows, chunkSize), (batch) => duck.append(table, batch), {
      concurrency: 1,
      discard: true,
    })
  );
}

export const appendWithIds: {
  (prefix: string, rows: AppendRows): (table: DuckTable) => ReturnType<typeof appendIdentified>;
  (table: DuckTable, prefix: string, rows: AppendRows): ReturnType<typeof appendIdentified>;
} = dual(3, appendIdentified);

function appendIdentified(table: DuckTable, prefix: string, rows: AppendRows) {
  return appendTo(
    table,
    Arr.map(rows, (row, position) => ({ id: `${prefix}${position}`, ...row }))
  ).pipe(Effect.as(rows.length));
}
