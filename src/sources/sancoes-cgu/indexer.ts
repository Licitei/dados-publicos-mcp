import { Clock, Effect, pipe } from "effect";
import * as Arr from "effect/Array";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  csvOptions,
  datasets,
  isEfeitosCsv,
  lookbackDays,
  mapSancoes,
  SancaoError,
  sancaoTable,
  yyyymmdd,
  zipUrl,
  type DatasetSpec,
  type SancaoFlat,
} from "./catalog";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

const idStride = 10_000_000;

const insertSancoes = (rows: readonly SancaoFlat[], datasetPosition: number) =>
  appendRows(
    sancaoTable,
    Arr.map(rows, (row, position) => ({ id: datasetPosition * idStride + position, ...row }))
  );

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } }));

const snapshotOf = (dataset: DatasetSpec, millis: number) =>
  Effect.firstSuccessOf(
    pipe(
      range(lookbackDays),
      Arr.map((offset) =>
        failMissing(downloadZip(zipUrl(dataset, yyyymmdd(millis, offset + 1))), () =>
          SancaoError.make({ code: "sancoes.SNAPSHOT_MISSING", dataset: dataset.key })
        )
      )
    )
  );

const rowsFromZip = (dataset: DatasetSpec, bytes: Uint8Array) =>
  unzipEntries(bytes, acceptCsv).pipe(
    Effect.map((entries) =>
      pipe(
        entries,
        Arr.filter((entry) => !isEfeitosCsv(entry.name)),
        Arr.flatMap((entry) => mapSancoes(dataset.key, parseCsvRecords(entry.data, csvOptions)))
      )
    )
  );

const indexDataset = (dataset: DatasetSpec, millis: number, datasetPosition: number) =>
  snapshotOf(dataset, millis).pipe(
    Effect.flatMap((bytes) => rowsFromZip(dataset, bytes)),
    Effect.catchCause(() => Effect.succeed([])),
    Effect.flatMap((rows) => insertSancoes(rows, datasetPosition).pipe(Effect.as(rows.length)))
  );

export const indexSnapshots = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
  Effect.forEach(datasets, (dataset, position) => indexDataset(dataset, millis, position), {
    concurrency: 2,
  }).pipe(
    Effect.map((counts) =>
      pipe(
        counts,
        Arr.reduce(0, (acc, n) => acc + n)
      )
    )
  )
);
