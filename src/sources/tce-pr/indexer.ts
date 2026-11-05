import { Effect } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import { Duck } from "../../kernel/duck/duck";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { parseCsvTable } from "../../kernel/csv/parse";
import { numeroBr } from "../../kernel/csv/fields";
import { publicDocument, publicText } from "../../kernel/text/document";
import { normalize } from "../../kernel/text/normalize";
import { TcePrError, tcePrTable, tcePrColumns, tcePrUrl, type TcePrRaw } from "./catalog";

export const indexTcePr = (years: readonly number[]) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const duck = yield* Duck;
    yield* duck.create(tcePrTable);
    const counts = yield* Effect.forEach(
      Arr.dedupe(years),
      (year) =>
        Effect.gen(function* () {
          const url = tcePrUrl(year);
          const bytes = yield* http
            .bytes(url, { timeoutMs: 180000 })
            .pipe(Effect.mapError(() => TcePrError.make({ code: "tce-pr.DOWNLOAD" })));
          const csv = parseCsvTable(bytes, { delimiter: ";" });
          yield* csv.columns.length === tcePrColumns.length &&
          Arr.every(tcePrColumns, (column) => csv.columns.includes(column))
            ? Effect.void
            : Effect.fail(TcePrError.make({ code: "tce-pr.PARSE" }));
          const rows = Arr.map(csv.records, (row: (typeof TcePrRaw)["Type"], position) => {
            const normalized = Rec.map(tcePrTable.columns, (type, column) => {
              const value = row[column] ?? "";
              return type === "DOUBLE"
                ? numeroBr(value)
                : value === ""
                  ? null
                  : column === "nrDocumento"
                    ? publicDocument(value)
                    : /^(?:nm|ds)/i.test(column)
                      ? publicText(value)
                      : value;
            });
            return {
              ...normalized,
              __id: `${year}:${position}`,
              __ano: year,
              __fonte: url,
              __busca: normalize(
                `${publicText(row.nmRazaoSocial ?? "")} ${publicText(row.dsObjeto ?? "")}`
              ),
            };
          });
          yield* appendRows(tcePrTable, rows);
          return rows.length;
        }),
      { concurrency: 1 }
    );
    return Arr.reduce(counts, 0, (sum, count) => sum + count);
  });
