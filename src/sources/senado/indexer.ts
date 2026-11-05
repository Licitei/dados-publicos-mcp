import { Effect } from "effect";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
import {
  ceapsUrl,
  csvOptions,
  dropFirstLine,
  mapCeaps,
  mapSenadores,
  SenadoError,
  SenadoresPayload,
  senadoresUrl,
} from "./catalog";

export const loadSenadores = Effect.flatMap(Http, (http) =>
  http.json(senadoresUrl, SenadoresPayload, {
    headers: { accept: "application/json" },
  })
).pipe(Effect.map(mapSenadores));

const downloadCsv = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "text/csv" } }));

export const loadCeapsAno = (ano: number) =>
  failMissing(downloadCsv(ceapsUrl(ano)), () =>
    SenadoError.make({ code: "senado.CEAPS_MISSING", ano })
  ).pipe(
    Effect.map((bytes) => mapCeaps(parseCsvRecords(dropFirstLine(bytes), csvOptions))),
    Effect.catchTag("SenadoError", () => Effect.succeed(mapCeaps([])))
  );
