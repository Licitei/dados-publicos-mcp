import { Clock, Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { despesaFederal } from "../../kernel/db/schemas/despesa-federal";
import { httpResponse, HttpError } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  csvOptions,
  DespesaError,
  mapDespesas,
  zipUrl,
  type DespesaFederalFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly DespesaFederalFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(despesaFederal).values([...batch])),
    { concurrency: 1, discard: true }
  );

const monthsAgo = (millis: number, n: number) => {
  const date = new Date(millis);
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - n, 1)
  );
  return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const defaultAnoMes = Effect.map(Clock.currentTimeMillis, (millis) =>
  monthsAgo(millis, 2)
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
  anoMes: string
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            new DespesaError({ code: "transparencia.MES_MISSING", anoMes })
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

export const indexMes = (anoMes: string) =>
  tolerateMissing(downloadZip(zipUrl(anoMes)), anoMes).pipe(
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.map((entries) =>
      entries.length === 0
        ? []
        : mapDespesas(parseCsvRecords(entries[0].data, csvOptions))
    ),
    Effect.catchTag("DespesaError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );
