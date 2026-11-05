import { DateTime, Effect, Match, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { despesaFederal } from "../../kernel/db/schemas/despesa-federal";
import { Http, HttpError } from "../../kernel/http/client";
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

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const insertRows = (rows: readonly DespesaFederalFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(despesaFederal).values([...batch])),
    { concurrency: 1, discard: true }
  );

const monthsAgo = (now: DateTime.Utc, n: number) => {
  const total =
    DateTime.getPartUtc(now, "year") * 12 +
    (DateTime.getPartUtc(now, "month") - 1) -
    n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}${pipe(String(month), Str.padStart(2, "0"))}`;
};

export const defaultAnoMes = Effect.map(DateTime.now, (now) =>
  monthsAgo(now, 2)
);

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } }));

const tolerateMissing = <R>(
  effect: Effect.Effect<
    Uint8Array,
    HttpError,
    R
  >,
  anoMes: string
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () =>
          Effect.fail(
            DespesaError.make({ code: "transparencia.MES_MISSING", anoMes })
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
      pipe(
        Arr.head(entries),
        Option.match({
          onNone: (): readonly DespesaFederalFlat[] => [],
          onSome: (entry) =>
            mapDespesas(parseCsvRecords(entry.data, csvOptions)),
        })
      )
    ),
    Effect.catchTag("DespesaError", () => Effect.succeed([])),
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );
