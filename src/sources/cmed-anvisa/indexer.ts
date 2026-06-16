import { Effect, Match } from "effect";
import { Db } from "../../kernel/db/client";
import { medicamentoCmed } from "../../kernel/db/schemas/medicamento-cmed";
import { httpResponse } from "../../kernel/http/client";
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

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly MedicamentoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) =>
        db.insert(medicamentoCmed).values([...batch])
      ),
    { concurrency: 1, discard: true }
  );

const resolveDownloadUrl = httpResponse(precosPage, {
  headers: { ...browserHeaders, accept: "text/html" },
}).pipe(
  Effect.flatMap((response) => response.text),
  Effect.flatMap((html) =>
    Match.value(downloadUrlFromPage(html)).pipe(
      Match.when(Match.string, (url) => Effect.succeed(url)),
      Match.orElse(() =>
        Effect.fail(new CmedError({ code: "cmed.FILE_NOT_LISTED" }))
      )
    )
  )
);

const downloadXlsx = (url: string) =>
  httpResponse(url, {
    headers: {
      ...browserHeaders,
      accept:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

export const indexCmed = resolveDownloadUrl.pipe(
  Effect.flatMap(downloadXlsx),
  Effect.flatMap((bytes) => readXlsxSheet(bytes, sheetMatcher)),
  Effect.map(mapMedicamentos),
  Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
);
