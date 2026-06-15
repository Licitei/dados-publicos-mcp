import { Effect, Match } from "effect";
import { HttpClientError } from "effect/unstable/http";
import { Db } from "../../kernel/db/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { cota } from "../../kernel/db/schemas/despesa-camara";
import { deputado } from "../../kernel/db/schemas/deputado";
import { proposicaoAutor } from "../../kernel/db/schemas/proposicao-autor";
import { httpResponse, HttpError } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptCsv,
  ceapUrl,
  csvOptions,
  DEPUTADOS_URL,
  mapCotas,
  mapDeputados,
  mapProposicaoAutores,
  mapProposicoes,
  proposicoesAutoresUrl,
  proposicoesUrl,
  type CotaFlat,
  type DeputadoFlat,
  type ProposicaoAutorFlat,
  type ProposicaoFlat,
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

const downloadCsv = (url: string) =>
  httpResponse(url, { headers: { accept: "text/csv" } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

const tolerateMissing = <A, R>(
  effect: Effect.Effect<A, HttpError | HttpClientError.HttpClientError, R>,
  empty: A
) =>
  effect.pipe(
    Effect.catchTag("HttpError", (error) =>
      Match.value(error).pipe(
        Match.when({ code: "http.STATUS" }, () => Effect.succeed(empty)),
        Match.orElse(() => Effect.fail(error))
      )
    )
  );

const insertDeputados = (rows: readonly DeputadoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(deputado).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertCotas = (rows: readonly CotaFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) => Effect.flatMap(Db, (db) => db.insert(cota).values([...batch])),
    { concurrency: 1, discard: true }
  );

const insertProposicaoAutores = (rows: readonly ProposicaoAutorFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) =>
        db.insert(proposicaoAutor).values([...batch])
      ),
    { concurrency: 1, discard: true }
  );

export const indexDeputados = Effect.gen(function* () {
  const bytes = yield* downloadCsv(DEPUTADOS_URL);
  const rows = mapDeputados(parseCsvRecords(bytes, csvOptions));
  yield* insertDeputados(rows);
  return rows.length;
});

export const indexCotas = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* tolerateMissing(
      downloadZip(ceapUrl(ano)),
      new Uint8Array()
    );
    const rows = yield* Match.value(bytes.length).pipe(
      Match.when(0, () => Effect.succeed<readonly CotaFlat[]>([])),
      Match.orElse(() =>
        unzipEntries(bytes, acceptCsv).pipe(
          Effect.map((entries) =>
            entries.flatMap((entry) =>
              mapCotas(parseCsvRecords(entry.data, csvOptions))
            )
          )
        )
      )
    );
    yield* insertCotas(rows);
    return rows.length;
  });

const emptyProposicoes: readonly ProposicaoFlat[] = [];
const emptyAutores: readonly ProposicaoAutorFlat[] = [];

export const loadProposicoes = (ano: number) =>
  tolerateMissing(
    downloadCsv(proposicoesUrl(ano)).pipe(
      Effect.map((bytes) => mapProposicoes(parseCsvRecords(bytes, csvOptions)))
    ),
    emptyProposicoes
  );

export const indexProposicaoAutores = (ano: number) =>
  Effect.gen(function* () {
    const rows = yield* tolerateMissing(
      downloadCsv(proposicoesAutoresUrl(ano)).pipe(
        Effect.map((bytes) =>
          mapProposicaoAutores(parseCsvRecords(bytes, csvOptions))
        )
      ),
      emptyAutores
    );
    yield* insertProposicaoAutores(rows);
    return rows.length;
  });
