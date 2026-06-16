import { Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { ceapsDespesa } from "../../kernel/db/schemas/ceaps-despesa";
import { senador } from "../../kernel/db/schemas/senador";
import { getJson, httpResponse, HttpError } from "../../kernel/http/client";
import {
  ceapsUrl,
  csvOptions,
  dropFirstLine,
  mapCeaps,
  mapSenadores,
  SenadoError,
  SenadoresPayload,
  senadoresUrl,
  type CeapsFlat,
  type SenadorFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertSenadores = (rows: readonly SenadorFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(senador).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertCeaps = (rows: readonly CeapsFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(ceapsDespesa).values([...batch])),
    { concurrency: 1, discard: true }
  );

export const indexSenadores = getJson(senadoresUrl, SenadoresPayload, {
  headers: { accept: "application/json" },
}).pipe(
  Effect.map(mapSenadores),
  Effect.flatMap((rows) => insertSenadores(rows).pipe(Effect.as(rows.length)))
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
  ano: number
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(new SenadoError({ code: "senado.CEAPS_MISSING", ano }))
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

export const indexCeapsAno = (ano: number) =>
  tolerateMissing(downloadCsv(ceapsUrl(ano)), ano).pipe(
    Effect.map((bytes) =>
      mapCeaps(parseCsvRecords(dropFirstLine(bytes), csvOptions))
    ),
    Effect.catchTag("SenadoError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertCeaps(rows).pipe(Effect.as(rows.length)))
  );
