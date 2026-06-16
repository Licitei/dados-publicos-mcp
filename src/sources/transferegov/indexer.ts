import { Effect } from "effect";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Db } from "../../kernel/db/client";
import { convenio } from "../../kernel/db/schemas/convenio";
import { httpResponse } from "../../kernel/http/client";
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

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly ConvenioFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(convenio).values([...batch])),
    { concurrency: 1, discard: true }
  );

const fetchCsv = (url: string) =>
  httpResponse(url, { headers: { accept: "application/zip" } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer)),
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.map((entries) =>
      entries.length === 0
        ? []
        : parseCsvRecords(entries[0].data, csvOptions)
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
