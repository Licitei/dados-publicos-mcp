import { Effect, Match } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { tcuInidoneo } from "../../kernel/db/schemas/tcu-inidoneo";
import { Http, HttpError } from "../../kernel/http/client";
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

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const insertRows = (rows: readonly TcuInidoneoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(tcuInidoneo).values([...batch])),
    { concurrency: 1, discard: true }
  );

const downloadCsv = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "text/csv" } }));

const tolerateMissing = <R>(
  effect: Effect.Effect<
    Uint8Array,
    HttpError,
    R
  >,
  dataset: DatasetSpec
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            TcuError.make({ code: "tcu.DATASET_MISSING", dataset: dataset.key })
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
}).pipe(Effect.map((counts) => pipe(counts, Arr.reduce(0, (acc, n) => acc + n))));
