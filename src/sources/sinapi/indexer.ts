import { DateTime, Effect, Match } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import { Db } from "../../kernel/db/client";
import { sinapiInsumo } from "../../kernel/db/schemas/sinapi-insumo";
import { Http, HttpError } from "../../kernel/http/client";
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

const chunks = <A>(items: readonly A[]) => Arr.chunksOf(items, chunkSize);

const insertRows = (rows: readonly SinapiInsumoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(sinapiInsumo).values([...batch])),
    { concurrency: 1, discard: true }
  );

const refAgo = (now: DateTime.Utc, n: number) => {
  const shifted = DateTime.subtract(DateTime.startOf(now, "month"), { months: n });
  return {
    ano: DateTime.getPartUtc(shifted, "year"),
    mes: DateTime.getPartUtc(shifted, "month"),
  };
};

export const defaultReferencia = Effect.map(DateTime.now, (now) =>
  refAgo(now, 1)
);

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, {
    headers: {
      "user-agent": browserUserAgent,
      accept: "application/zip",
    },
  }));

const tolerateMissing = <R>(
  effect: Effect.Effect<
    Uint8Array,
    HttpError,
    R
  >,
  referencia: string
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            SinapiError.make({ code: "sinapi.RELATORIO_MISSING", referencia })
          )
        ),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

const indexReferenciaImpl = (ano: number, mes: number) =>
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
      Effect.catchTags({
        SinapiError: () => Effect.succeed([]),
        XlsxError: () => Effect.succeed([]),
        ZipError: () => Effect.succeed([]),
      })
    );
    yield* insertRows(rows);
    return rows.length;
  });

export const indexReferencia: {
  (
    mes: number
  ): (ano: number) => ReturnType<typeof indexReferenciaImpl>;
  (ano: number, mes: number): ReturnType<typeof indexReferenciaImpl>;
} = dual(2, indexReferenciaImpl);
