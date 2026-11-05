import { DateTime, Effect, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  csvOptions,
  DespesaError,
  despesaFederalTable,
  mapDespesas,
  zipUrl,
  type DespesaFederalFlat,
} from "./catalog";

const insertRows = (rows: readonly DespesaFederalFlat[]) =>
  appendRows(
    despesaFederalTable,
    Arr.map(rows, (row, position) => ({ id: position, ...row }))
  );

const monthsAgo = (now: DateTime.Utc, n: number) => {
  const total = DateTime.getPartUtc(now, "year") * 12 + (DateTime.getPartUtc(now, "month") - 1) - n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}${pipe(String(month), Str.padStart(2, "0"))}`;
};

export const defaultAnoMes = Effect.map(DateTime.now, (now) => monthsAgo(now, 2));

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } }));

export const indexMes = (anoMes: string) =>
  failMissing(downloadZip(zipUrl(anoMes)), () =>
    DespesaError.make({ code: "transparencia.MES_MISSING", anoMes })
  ).pipe(
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.map((entries) =>
      pipe(
        Arr.head(entries),
        Option.match({
          onNone: (): readonly DespesaFederalFlat[] => [],
          onSome: (entry) => mapDespesas(parseCsvRecords(entry.data, csvOptions)),
        })
      )
    ),
    Effect.catchTag("DespesaError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );
