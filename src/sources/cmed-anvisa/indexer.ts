import { Effect, Match } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { Db } from "../../kernel/db/client";
import { medicamentoCmed } from "../../kernel/db/schemas/medicamento-cmed";
import { Http } from "../../kernel/http/client";
import { readXlsxSheet } from "../../kernel/xlsx/sheet";
import {
  browserUserAgent,
  CmedError,
  downloadUrlFromPage,
  mapMedicamentos,
  precosPage,
  sheetMatcher,
  type MedicamentoFlat,
} from "./catalog";

const chunkSize = 2_000;

const browserHeaders = {
  "user-agent": browserUserAgent,
  "accept-language": "pt-BR,pt;q=0.9",
};

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const insertRows = (rows: readonly MedicamentoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) =>
        db.insert(medicamentoCmed).values([...batch])
      ),
    { concurrency: 1, discard: true }
  );

const resolveDownloadUrl = Effect.flatMap(Http, (http) =>
  http.text(precosPage, {
    headers: { ...browserHeaders, accept: "text/html" },
  })
).pipe(
  Effect.flatMap((html) =>
    Match.value(downloadUrlFromPage(html)).pipe(
      Match.when(Match.string, (url) => Effect.succeed(url)),
      Match.orElse(() =>
        Effect.fail(CmedError.make({ code: "cmed.FILE_NOT_LISTED" }))
      )
    )
  )
);

const downloadXlsx = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, {
      headers: {
        ...browserHeaders,
        accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    })
  );

export const indexCmed = resolveDownloadUrl.pipe(
  Effect.flatMap(downloadXlsx),
  Effect.flatMap((bytes) => readXlsxSheet(bytes, sheetMatcher)),
  Effect.map(mapMedicamentos),
  Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
);
