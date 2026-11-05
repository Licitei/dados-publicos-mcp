import { Effect } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import * as Option from "effect/Option";
import { Duck } from "../../kernel/duck/duck";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { parseCsvTable } from "../../kernel/csv/parse";
import { numeroBr } from "../../kernel/csv/fields";
import { forEachZipEntry } from "../../kernel/zip/archive";
import { publicDocument, publicText } from "../../kernel/text/document";
import { normalize } from "../../kernel/text/normalize";
import { TceRsError, tceRsFiles, tceRsTables, tceRsUrl } from "./catalog";

export const indexTceRs = (years: readonly number[]) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const duck = yield* Duck;
    yield* Effect.forEach(tceRsTables, (table) => duck.create(table), { concurrency: 1 });
    const counts = yield* Effect.forEach(
      Arr.flatMap(Arr.dedupe(years), (year) =>
        Arr.map(Arr.dedupe(Arr.map(tceRsFiles, (entry) => entry.dataset)), (dataset) => ({
          year,
          dataset,
        }))
      ),
      ({ year, dataset }) =>
        Effect.gen(function* () {
          const url = tceRsUrl({ dataset, year });
          const bytes = yield* http
            .bytes(url, { timeoutMs: 300000 })
            .pipe(Effect.mapError(() => TceRsError.make({ code: "tce-rs.DOWNLOAD" })));
          const files = Arr.filter(tceRsFiles, (entry) => entry.dataset === dataset);
          const loaded = yield* forEachZipEntry(bytes, Str.endsWith(".csv"), (entry) =>
            Effect.gen(function* () {
              const filename = Arr.last(Str.split(entry.name, "/")).pipe(
                Option.getOrElse(() => entry.name)
              );
              const definition = yield* Effect.fromOption(
                Arr.findFirst(files, (file) => file.file === filename)
              ).pipe(Effect.mapError(() => TceRsError.make({ code: "tce-rs.PARSE" })));
              const table = definition.table;
              const columns = Arr.filter(
                Rec.keys(table.columns),
                (column) => !Str.startsWith("__")(column)
              );
              const csv = parseCsvTable(entry.data, { delimiter: "," });
              yield* csv.columns.length === columns.length &&
              Arr.every(columns, (column) => csv.columns.includes(column))
                ? Effect.void
                : Effect.fail(TceRsError.make({ code: "tce-rs.PARSE" }));
              const rows = Arr.map(csv.records, (row, position) => {
                const values = Rec.map(table.columns, (type, column) => {
                  const value = row[column] ?? "";
                  return type === "DOUBLE"
                    ? numeroBr(value)
                    : value === ""
                      ? null
                      : /(?:CPF|CNPJ|NR_DOCUMENTO)/.test(column)
                        ? publicDocument(value)
                        : /^(?:DS_|NM_|NOME_)/.test(column)
                          ? publicText(value)
                          : value;
                });
                return {
                  ...values,
                  __id: `${year}:${position}`,
                  __ano: year,
                  __fonte: url,
                  __busca: normalize(
                    publicText(
                      Arr.join(
                        Arr.map(
                          Arr.filter(columns, (column) => /^(?:DS_|NM_|NOME_)/.test(column)),
                          (column) => row[column] ?? ""
                        ),
                        " "
                      )
                    )
                  ),
                };
              });
              yield* appendRows(table, rows);
              return { file: filename, count: rows.length };
            })
          );
          yield* loaded.length === files.length &&
          Arr.every(
            files,
            (file) => Arr.filter(loaded, (entry) => entry.file === file.file).length === 1
          )
            ? Effect.void
            : Effect.fail(TceRsError.make({ code: "tce-rs.PARSE" }));
          return Arr.reduce(loaded, 0, (sum, entry) => sum + entry.count);
        }),
      { concurrency: 1 }
    );
    return Arr.reduce(counts, 0, (sum, count) => sum + count);
  });
