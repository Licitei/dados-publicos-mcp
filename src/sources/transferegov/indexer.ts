import { Effect, Option } from "effect";
import * as Arr from "effect/Array";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { convenio } from "../../kernel/db/schemas/convenio";
import { Http } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  convenioZipUrl,
  csvOptions,
  mapConvenios,
  mapPropostas,
  propostaZipUrl,
  type ConvenioFlat,
} from "./catalog";

const chunkSize = 2_000;

const chunks = <A>(items: readonly A[]) => Arr.chunksOf(items, chunkSize);

const insertRows = (rows: readonly ConvenioFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(convenio).values([...batch])),
    { concurrency: 1, discard: true }
  );

const fetchCsv = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, { headers: { accept: "application/zip" } })
  ).pipe(
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
