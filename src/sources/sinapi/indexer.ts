import { Clock, Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { Db } from "../../kernel/db/client";
import { sinapiInsumo } from "../../kernel/db/schemas/sinapi-insumo";
import { httpResponse, HttpError } from "../../kernel/http/client";
import { readXlsxSheet } from "../../kernel/xlsx/sheet";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  browserUserAgent,
  isdSheetMatcher,
  mapInsumos,
  mesReferenciaOf,
  referenciaMatcher,
  SinapiError,
  zipUrl,
  type SinapiInsumoFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly SinapiInsumoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(sinapiInsumo).values([...batch])),
    { concurrency: 1, discard: true }
  );

const refAgo = (millis: number, n: number) => {
  const date = new Date(millis);
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - n, 1)
  );
  return { ano: shifted.getUTCFullYear(), mes: shifted.getUTCMonth() + 1 };
};

export const defaultReferencia = Effect.map(Clock.currentTimeMillis, (millis) =>
  refAgo(millis, 1)
);

const downloadZip = (url: string) =>
  httpResponse(url, {
    headers: {
      "user-agent": browserUserAgent,
      accept: "application/zip",
    },
  }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

const tolerateMissing = <R>(
  effect: Effect.Effect<
    Uint8Array,
    HttpError | HttpClientError.HttpClientError,
    R
  >,
  referencia: string
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            new SinapiError({ code: "sinapi.RELATORIO_MISSING", referencia })
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

export const indexReferencia = (ano: number, mes: number) =>
  Effect.gen(function* () {
    const referencia = mesReferenciaOf(ano, mes);
    const rows = yield* tolerateMissing(
      downloadZip(zipUrl(ano, mes)),
      referencia
    ).pipe(
      Effect.flatMap((bytes) => unzipEntries(bytes, referenciaMatcher)),
      Effect.flatMap((entries) =>
        Match.value(entries[0]).pipe(
          Match.when(Match.undefined, () => Effect.succeed([])),
          Match.orElse((entry) =>
            readXlsxSheet(entry.data, isdSheetMatcher).pipe(
              Effect.map((sheet) => mapInsumos(sheet, referencia))
            )
          )
        )
      ),
      Effect.catchTag("SinapiError", () => Effect.succeed([])),
      Effect.catchTag("XlsxError", () => Effect.succeed([])),
      Effect.catchTag("ZipError", () => Effect.succeed([]))
    );
    yield* insertRows(rows);
    return rows.length;
  });
