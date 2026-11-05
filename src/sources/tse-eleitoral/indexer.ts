import { Effect, Match, pipe } from "effect";
import * as Arr from "effect/Array";
import { Db } from "../../kernel/db/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { bem } from "../../kernel/db/schemas/bem";
import { candidato } from "../../kernel/db/schemas/candidato";
import { despesa } from "../../kernel/db/schemas/despesa";
import { receita } from "../../kernel/db/schemas/receita";
import { receitaOriginario } from "../../kernel/db/schemas/receita-originario";
import { Http } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptBrasil,
  acceptPrestacao,
  bemFile,
  candidatoFile,
  classifyPrestacao,
  csvOptions,
  mapBens,
  mapCandidatos,
  mapDespesas,
  mapReceitas,
  mapReceitasOriginario,
  zipUrl,
  type BemFlat,
  type CandidatoFlat,
  type DespesaFlat,
  type ReceitaFlat,
  type ReceitaOrigFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  pipe(
    range(Math.ceil(items.length / chunkSize)),
    Arr.map((position) =>
      items.slice(position * chunkSize, position * chunkSize + chunkSize)
    )
  );

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, { headers: { accept: "application/zip" } })
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

const insertReceitas = (rows: readonly ReceitaFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(receita).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertDespesas = (rows: readonly DespesaFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(despesa).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertOriginario = (rows: readonly ReceitaOrigFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(receitaOriginario).values([...batch])),
    { concurrency: 1, discard: true }
  );

export const indexCandidatos = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(zipUrl("consulta_cand", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil(candidatoFile));
    const rows = pipe(
      entries,
      Arr.flatMap((entry) =>
        mapCandidatos(parseCsvRecords(entry.data, csvOptions))
      )
    );
    yield* insertCandidatos(rows);
    return rows.length;
  });

export const indexBens = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(zipUrl("bem_candidato", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil(bemFile));
    const rows = pipe(
      entries,
      Arr.flatMap((entry) => mapBens(parseCsvRecords(entry.data, csvOptions)))
    );
    yield* insertBens(rows);
    return rows.length;
  });

const loadEntry = (name: string, records: readonly Record<string, string>[]) =>
  Match.value(classifyPrestacao(name)).pipe(
    Match.when("receita", () =>
      insertReceitas(mapReceitas(records)).pipe(Effect.as(records.length))
    ),
    Match.when("despesa", () =>
      insertDespesas(mapDespesas(records)).pipe(Effect.as(records.length))
    ),
    Match.when("receita_originario", () =>
      insertOriginario(mapReceitasOriginario(records)).pipe(
        Effect.as(records.length)
      )
    ),
    Match.orElse(() => Effect.succeed(0))
  );

export const indexPrestacao = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(zipUrl("prestacao_contas", ano));
    const entries = yield* unzipEntries(bytes, acceptPrestacao);
    const counts = yield* Effect.forEach(
      entries,
      (entry) => loadEntry(entry.name, parseCsvRecords(entry.data, csvOptions)),
      { concurrency: 1 }
    );
    return pipe(
      counts,
      Arr.reduce(0, (acc, count) => acc + count)
    );
  });
