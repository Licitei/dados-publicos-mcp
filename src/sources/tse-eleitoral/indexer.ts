import { Effect, Match, pipe } from "effect";
import * as Arr from "effect/Array";
import { appendWithIds } from "../../kernel/duck/append";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { type DuckTable } from "../../kernel/duck/duck";
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
} from "./catalog";

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept: "application/zip" } }));

export const indexCandidatos = (input: { readonly table: DuckTable; readonly ano: number }) =>
  Effect.gen(function* () {
    const { table, ano } = input;
    const bytes = yield* downloadZip(zipUrl("consulta_cand", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil(candidatoFile));
    const rows = pipe(
      entries,
      Arr.flatMap((entry) => mapCandidatos(parseCsvRecords(entry.data, csvOptions)))
    );
    return yield* appendWithIds(table, `${ano}-`, rows);
  });

export const indexBens = (input: { readonly table: DuckTable; readonly ano: number }) =>
  Effect.gen(function* () {
    const { table, ano } = input;
    const bytes = yield* downloadZip(zipUrl("bem_candidato", ano));
    const entries = yield* unzipEntries(bytes, acceptBrasil(bemFile));
    const rows = pipe(
      entries,
      Arr.flatMap((entry) => mapBens(parseCsvRecords(entry.data, csvOptions)))
    );
    return yield* appendWithIds(table, `${ano}-`, rows);
  });

export const indexPrestacao = (input: {
  readonly tables: {
    readonly receita: DuckTable;
    readonly despesa: DuckTable;
    readonly originario: DuckTable;
  };
  readonly ano: number;
}) =>
  Effect.gen(function* () {
    const { tables, ano } = input;
    const bytes = yield* downloadZip(zipUrl("prestacao_contas", ano));
    const entries = yield* unzipEntries(bytes, acceptPrestacao);
    const counts = yield* Effect.forEach(
      entries,
      (entry, position) => {
        const prefix = `${ano}-${position}-`;
        const records = parseCsvRecords(entry.data, csvOptions);
        return Match.value(classifyPrestacao(entry.name)).pipe(
          Match.when("receita", () => appendWithIds(tables.receita, prefix, mapReceitas(records))),
          Match.when("despesa", () => appendWithIds(tables.despesa, prefix, mapDespesas(records))),
          Match.when("receita_originario", () =>
            appendWithIds(tables.originario, prefix, mapReceitasOriginario(records))
          ),
          Match.orElse(() => Effect.succeed(0))
        );
      },
      { concurrency: 1 }
    );
    return pipe(
      counts,
      Arr.reduce(0, (acc, count) => acc + count)
    );
  });
