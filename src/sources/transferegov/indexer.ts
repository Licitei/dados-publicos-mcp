import { Effect, Option } from "effect";
import * as Arr from "effect/Array";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  convenioTable,
  convenioZipUrl,
  csvOptions,
  mapConvenios,
  mapPropostas,
  propostaZipUrl,
  type ConvenioFlat,
} from "./catalog";

const insertRows = (rows: readonly ConvenioFlat[]) =>
  appendRows(
    convenioTable,
    Arr.map(rows, (row, position) => ({ id: position, ...row }))
  );

const fetchCsv = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } })).pipe(
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.map((entries) =>
      Option.match(Arr.head(entries), {
        onNone: () => [],
        onSome: (entry) => parseCsvRecords(entry.data, csvOptions),
      })
    )
  );

export const indexAll = Effect.gen(function* () {
  const propostaRecords = yield* fetchCsv(propostaZipUrl);
  const propostas = mapPropostas(propostaRecords);
  const convenioRecords = yield* fetchCsv(convenioZipUrl);
  const convenios = mapConvenios(convenioRecords, propostas);
  yield* insertRows(convenios);
  return convenios.length;
});
