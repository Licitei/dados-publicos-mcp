import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { forEachZipEntry } from "../../kernel/zip/archive";
import {
  PgfnError,
  PgfnRow,
  pgfnRow,
  pgfnUrl,
  pgfnTable,
  pgfnNaoPrevidenciarioTable,
  type PgfnIndex,
} from "./catalog";

export const indexPgfn = (spec: (typeof PgfnIndex)["Type"]) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const duck = yield* Duck;
    const table = spec.heavy ? pgfnNaoPrevidenciarioTable : pgfnTable;
    yield* duck.create(table);
    const counts = yield* Effect.forEach(
      spec.datasets,
      (dataset) =>
        Effect.gen(function* () {
          const bytes = yield* http
            .bytes(pgfnUrl(dataset), { timeoutMs: 300000 })
            .pipe(
              Effect.mapError((cause) =>
                PgfnError.make({ code: "pgfn.DOWNLOAD", cause: cause.message })
              )
            );
          const parts = yield* forEachZipEntry(
            bytes,
            (name) => /\.csv$/i.test(name),
            (entry) =>
              Effect.gen(function* () {
                const rows = yield* Effect.forEach(
                  parseCsvRecords(entry.data, { delimiter: ";", encoding: "latin1" }),
                  (row, position) =>
                    Schema.decodeUnknownEffect(PgfnRow)(
                      pgfnRow({ row, dataset, file: entry.name, position })
                    )
                );
                yield* appendRows(table, rows);
                return rows.length;
              })
          );
          const count = Arr.reduce(parts, 0, (sum, part) => sum + part);
          return yield* count > 0
            ? Effect.succeed(count)
            : Effect.fail(PgfnError.make({ code: "pgfn.EMPTY" }));
        }),
      { concurrency: 1 }
    );
    return Arr.reduce(counts, 0, (sum, count) => sum + count);
  }).pipe(
    Effect.mapError((cause) =>
      Schema.is(PgfnError)(cause) ? cause : PgfnError.make({ code: "pgfn.PARSE" })
    )
  );
