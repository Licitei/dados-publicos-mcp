import { Effect } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
import {
  csvOptions,
  datasets,
  fileUrl,
  mapInidoneos,
  TcuError,
  tcuInidoneoTable,
  type DatasetSpec,
  type TcuInidoneoFlat,
} from "./catalog";

const idStride = 10_000_000;

const insertRows = (rows: readonly TcuInidoneoFlat[], datasetPosition: number) =>
  appendRows(
    tcuInidoneoTable,
    Arr.map(rows, (row, position) => ({ id: datasetPosition * idStride + position, ...row }))
  );

const downloadCsv = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "text/csv" } }));

const indexDataset = (dataset: DatasetSpec, datasetPosition: number) =>
  failMissing(downloadCsv(fileUrl(dataset)), () =>
    TcuError.make({ code: "tcu.DATASET_MISSING", dataset: dataset.key })
  ).pipe(
    Effect.map((bytes) => mapInidoneos(dataset.key, parseCsvRecords(bytes, csvOptions))),
    Effect.catchTag("TcuError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertRows(rows, datasetPosition).pipe(Effect.as(rows.length)))
  );

export const indexAll = Effect.forEach(
  datasets,
  (dataset, position) => indexDataset(dataset, position),
  {
    concurrency: 2,
  }
).pipe(
  Effect.map((counts) =>
    pipe(
      counts,
      Arr.reduce(0, (acc, n) => acc + n)
    )
  )
);
