import { DateTime, Effect, Match } from "effect";
import { dual } from "effect/Function";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
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

const refAgo = (now: DateTime.Utc, n: number) => {
  const shifted = DateTime.subtract(DateTime.startOf(now, "month"), { months: n });
  return {
    ano: DateTime.getPartUtc(shifted, "year"),
    mes: DateTime.getPartUtc(shifted, "month"),
  };
};

export const defaultReferencia = Effect.map(DateTime.now, (now) => refAgo(now, 1));

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, {
      headers: {
        "user-agent": browserUserAgent,
        accept: "application/zip",
      },
    })
  );

const indexReferenciaImpl = (ano: number, mes: number) =>
  Effect.gen(function* () {
    const referencia = mesReferenciaOf(ano, mes);
    const rows = yield* failMissing(downloadZip(zipUrl(ano, mes)), () =>
      SinapiError.make({ code: "sinapi.RELATORIO_MISSING", referencia })
    ).pipe(
      Effect.flatMap((bytes) => unzipEntries(bytes, referenciaMatcher)),
      Effect.flatMap((entries) =>
        Match.value(entries[0]).pipe(
          Match.when(Match.undefined, () => Effect.succeed<readonly SinapiInsumoFlat[]>([])),
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
    return rows;
  });

export const indexReferencia: {
  (mes: number): (ano: number) => ReturnType<typeof indexReferenciaImpl>;
  (ano: number, mes: number): ReturnType<typeof indexReferenciaImpl>;
} = dual(2, indexReferenciaImpl);
