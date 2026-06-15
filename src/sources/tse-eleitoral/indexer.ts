import { Effect } from "effect";
import { Db } from "../../kernel/db/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { bem } from "../../kernel/db/schemas/bem";
import { candidato } from "../../kernel/db/schemas/candidato";
import { httpResponse } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptBrasil,
  csvOptions,
  mapBens,
  mapCandidatos,
  zipUrl,
  type BemFlat,
  type CandidatoFlat,
} from "./catalog";

const chunkSize = 5_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const downloadZip = (url: string) =>
  httpResponse(url, { headers: { accept: "application/zip" } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

const insertCandidatos = (rows: readonly CandidatoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(candidato).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertBens = (rows: readonly BemFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(bem).values([...batch])),
    { concurrency: 1, discard: true }
  );

export const indexCandidatos = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(zipUrl("consulta_cand", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil("consulta_cand"));
    const rows = entries.flatMap((entry) =>
      mapCandidatos(parseCsvRecords(entry.data, csvOptions))
    );
    yield* insertCandidatos(rows);
    return rows.length;
  });

export const indexBens = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(zipUrl("bem_candidato", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil("bem_candidato"));
    const rows = entries.flatMap((entry) =>
      mapBens(parseCsvRecords(entry.data, csvOptions))
    );
    yield* insertBens(rows);
    return rows.length;
  });
