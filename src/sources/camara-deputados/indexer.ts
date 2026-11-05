import { Effect, Match } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Http } from "../../kernel/http/client";
import { tolerateMissing } from "../../kernel/http/missing";
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
  type ProposicaoAutorFlat,
  type ProposicaoFlat,
} from "./catalog";

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } }));

const downloadCsv = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "text/csv" } }));

export const loadDeputados = downloadCsv(DEPUTADOS_URL).pipe(
  Effect.map((bytes) => mapDeputados(parseCsvRecords(bytes, csvOptions)))
);

export const loadCotas = (ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* tolerateMissing(downloadZip(ceapUrl(ano)), new Uint8Array());
    return yield* Match.value(bytes.length).pipe(
      Match.when(0, () => Effect.succeed<readonly CotaFlat[]>([])),
      Match.orElse(() =>
        unzipEntries(bytes, acceptCsv).pipe(
          Effect.map((entries) =>
            pipe(
              entries,
              Arr.flatMap((entry) => mapCotas(parseCsvRecords(entry.data, csvOptions)))
            )
          )
        )
      )
    );
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

export const loadProposicaoAutores = (ano: number) =>
  tolerateMissing(
    downloadCsv(proposicoesAutoresUrl(ano)).pipe(
      Effect.map((bytes) => mapProposicaoAutores(parseCsvRecords(bytes, csvOptions)))
    ),
    emptyAutores
  );
