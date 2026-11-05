import { Http } from "../../kernel/http/client";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { defaultScope, extractCnpjs, type DiarioFlat } from "./catalog";
import { loadDiarios } from "./indexer";
import { appendRows } from "../../kernel/duck/append";

export const diarioTable: DuckTable = {
  name: "diario",
  key: "id",
  columns: {
    id: "INTEGER",
    territoryId: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    ano: "INTEGER",
    data: "VARCHAR",
    poder: "VARCHAR",
    edicao: "VARCHAR",
    edicaoExtra: "VARCHAR",
    urlOriginal: "VARCHAR",
    conteudo: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const diarioCnpjTable: DuckTable = {
  name: "diario_cnpj",
  key: "id",
  columns: { id: "INTEGER", diarioId: "INTEGER", cnpj: "VARCHAR" },
};

const chunkSize = 2_000;

const chunks = <A>(items: readonly A[]) => pipe(items, Arr.chunksOf(chunkSize));

const makeQueridoDiario = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const insertChunk = (batch: readonly DiarioFlat[]) =>
    Effect.gen(function* () {
      const offset = yield* duck.count(diarioTable);
      const cnpjOffset = yield* duck.count(diarioCnpjTable);
      yield* duck.append(
        diarioTable,
        Arr.map(batch, (row, position) => ({ ...row, id: offset + position + 1 }))
      );
      const cnpjRows = pipe(
        batch,
        Arr.flatMap((row, position) =>
          Arr.map(extractCnpjs(row.conteudo), (cnpj) => ({ diarioId: offset + position + 1, cnpj }))
        ),
        Arr.map((row, position) => ({ ...row, id: cnpjOffset + position + 1 }))
      );
      yield* appendRows(diarioCnpjTable, cnpjRows).pipe(Effect.provideService(Duck, duck));
      return cnpjRows.length;
    });

  const indexDiarios = (flat: readonly DiarioFlat[]) =>
    Effect.gen(function* () {
      const counts = yield* Effect.forEach(chunks(flat), insertChunk, {
        concurrency: 1,
      });
      return {
        diarios: flat.length,
        cnpjs: Arr.reduce(counts, 0, (acc, count) => acc + count),
      };
    });

  const indexScope = (scope: readonly { readonly uf: string; readonly ano: number }[]) =>
    Effect.gen(function* () {
      yield* duck.create(diarioTable);
      yield* duck.create(diarioCnpjTable);
      const counts = yield* Effect.forEach(
        scope,
        ({ uf, ano }) =>
          Effect.flatMap(
            loadDiarios(uf, ano).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            ),
            indexDiarios
          ),
        { concurrency: 1 }
      );
      yield* duck.reindex(diarioTable);
      yield* refreshSearch(diarioTable).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return Arr.reduce(counts, { diarios: 0, cnpjs: 0 }, (acc, count) => ({
        diarios: acc.diarios + count.diarios,
        cnpjs: acc.cnpjs + count.cnpjs,
      }));
    });

  const index = indexScope(defaultScope);

  return { index, indexScope };
});

export class QueridoDiario extends Context.Service<
  QueridoDiario,
  Effect.Success<typeof makeQueridoDiario>
>()("dados-publicos-mcp/sources/querido-diario/store/QueridoDiario") {}

export const QueridoDiarioLive = Layer.effect(QueridoDiario)(makeQueridoDiario);
