import { Effect, Match } from "effect";
import { Http } from "../../kernel/http/client";
import { readXlsxSheet } from "../../kernel/xlsx/sheet";
import {
  browserUserAgent,
  CmedError,
  downloadUrlFromPage,
  mapMedicamentos,
  precosPage,
  sheetMatcher,
} from "./catalog";

const browserHeaders = {
  "user-agent": browserUserAgent,
  "accept-language": "pt-BR,pt;q=0.9",
};

const resolveDownloadUrl = Effect.flatMap(Http, (http) =>
  http.text(precosPage, {
    headers: { ...browserHeaders, accept: "text/html" },
  })
).pipe(
  Effect.flatMap((html) =>
    Match.value(downloadUrlFromPage(html)).pipe(
      Match.when(Match.string, (url) => Effect.succeed(url)),
      Match.orElse(() => Effect.fail(CmedError.make({ code: "cmed.FILE_NOT_LISTED" })))
    )
  )
);

const downloadXlsx = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, {
      headers: {
        ...browserHeaders,
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    })
  );

export const indexCmed = resolveDownloadUrl.pipe(
  Effect.flatMap(downloadXlsx),
  Effect.flatMap((bytes) => readXlsxSheet(bytes, sheetMatcher)),
  Effect.map(mapMedicamentos)
);
