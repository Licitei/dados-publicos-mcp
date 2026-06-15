import { Clock, Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { Db } from "../../kernel/db/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { sancao } from "../../kernel/db/schemas/sancao";
import { httpResponse, HttpError } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  csvOptions,
  datasets,
  isEfeitosCsv,
  lookbackDays,
  mapSancoes,
  missingStatus,
  SancaoError,
  yyyymmdd,
  zipUrl,
  type DatasetSpec,
  type SancaoFlat,
} from "./catalog";

const chunkSize = 5_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertSancoes = (rows: readonly SancaoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(sancao).values([...batch])),
    { concurrency: 1, discard: true }
  );

const downloadZip = (url: string) =>
  httpResponse(url, { headers: { accept: "application/zip" } }).pipe(
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
        Match.when({ code: "http.STATUS" }, (status) =>
          Match.value(missingStatus.has(status.status ?? -1)).pipe(
            Match.when(true, () =>
              Effect.fail(
                new SancaoError({
                  code: "sancoes.SNAPSHOT_MISSING",
                  dataset: dataset.key,
                })
              )
            ),
            Match.orElse(() => Effect.fail(error))
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

const snapshotOf = (dataset: DatasetSpec, millis: number) =>
  Effect.firstSuccessOf(
    range(lookbackDays).map((offset) =>
      tolerateMissing(
        downloadZip(zipUrl(dataset, yyyymmdd(millis, offset + 1))),
        dataset
      )
    )
  );

const rowsFromZip = (dataset: DatasetSpec, bytes: Uint8Array) =>
  unzipEntries(bytes, acceptCsv).pipe(
    Effect.map((entries) =>
      entries
        .filter((entry) => !isEfeitosCsv(entry.name))
        .flatMap((entry) =>
          mapSancoes(dataset.key, parseCsvRecords(entry.data, csvOptions))
        )
    )
  );

const indexDataset = (dataset: DatasetSpec, millis: number) =>
  snapshotOf(dataset, millis).pipe(
    Effect.flatMap((bytes) => rowsFromZip(dataset, bytes)),
    Effect.catchCause(() => Effect.succeed([])),
    Effect.flatMap((rows) =>
      insertSancoes(rows).pipe(Effect.as(rows.length))
    )
  );

export const indexSnapshots = Effect.flatMap(
  Clock.currentTimeMillis,
  (millis) =>
    Effect.forEach(datasets, (dataset) => indexDataset(dataset, millis), {
      concurrency: 2,
    }).pipe(Effect.map((counts) => counts.reduce((acc, n) => acc + n, 0)))
);
