import { Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { tcuInidoneo } from "../../kernel/db/schemas/tcu-inidoneo";
import { httpResponse, HttpError } from "../../kernel/http/client";
import {
  csvOptions,
  datasets,
  fileUrl,
  mapInidoneos,
  TcuError,
  type DatasetSpec,
  type TcuInidoneoFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly TcuInidoneoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(tcuInidoneo).values([...batch])),
    { concurrency: 1, discard: true }
  );

const downloadCsv = (url: string) =>
  httpResponse(url, { headers: { accept: "text/csv" } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

const tolerateMissing = <R>(
  effect: Effect.Effect<
    Uint8Array,
    HttpError | HttpClientError.HttpClientError,
    R
  >,
  dataset: DatasetSpec
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            new TcuError({ code: "tcu.DATASET_MISSING", dataset: dataset.key })
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

const indexDataset = (dataset: DatasetSpec) =>
  tolerateMissing(downloadCsv(fileUrl(dataset)), dataset).pipe(
    Effect.map((bytes) =>
      mapInidoneos(dataset.key, parseCsvRecords(bytes, csvOptions))
    ),
    Effect.catchTag("TcuError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );

export const indexAll = Effect.forEach(datasets, indexDataset, {
  concurrency: 2,
}).pipe(Effect.map((counts) => counts.reduce((acc, n) => acc + n, 0)));
