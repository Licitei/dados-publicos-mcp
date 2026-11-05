import { Http } from "../../kernel/http/client";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Clock, Context, Effect, Layer } from "effect";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import {
  pncpTables,
  pncpItemTable,
  pncpInstrumentoTable,
  ataTable,
  contratacaoTable,
  contratoTable,
  defaultModalidades,
  defaultWindowStart,
  ymd,
} from "./catalog";
import {
  indexAtas,
  indexContratacoes,
  indexContratos,
  indexItens,
  indexInstrumentos,
} from "./indexer";

const makePncp = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexScope = (scope: {
    readonly dataInicial: string;
    readonly dataFinal: string;
    readonly modalidades: readonly number[];
  }) =>
    Effect.gen(function* () {
      yield* Effect.forEach(pncpTables, (table) => duck.create(table), {
        concurrency: 1,
        discard: true,
      });
      yield* indexContratacoes(scope).pipe(
        Effect.provideService(Http, http),
        Effect.provideService(Duck, duck)
      );
      yield* indexContratos({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      }).pipe(Effect.provideService(Http, http), Effect.provideService(Duck, duck));
      yield* indexAtas({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      }).pipe(Effect.provideService(Http, http), Effect.provideService(Duck, duck));
      yield* indexItens.pipe(Effect.provideService(Http, http), Effect.provideService(Duck, duck));
      yield* indexInstrumentos({ dataInicial: scope.dataInicial, dataFinal: scope.dataFinal }).pipe(
        Effect.provideService(Http, http),
        Effect.provideService(Duck, duck)
      );
      yield* Effect.forEach(pncpTables, (table) => duck.reindex(table), {
        concurrency: 1,
        discard: true,
      });
      yield* Effect.forEach(pncpTables, refreshSearch, { concurrency: 1 }).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return {
        contratacoes: yield* duck.count(contratacaoTable),
        contratos: yield* duck.count(contratoTable),
        atas: yield* duck.count(ataTable),
        itens: yield* duck.count(pncpItemTable),
        instrumentos: yield* duck.count(pncpInstrumentoTable),
      };
    }).pipe(duck.transaction);

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexScope({
      dataInicial: defaultWindowStart(millis),
      dataFinal: ymd(millis),
      modalidades: [...defaultModalidades],
    })
  );

  return { index, indexScope };
});

export class Pncp extends Context.Service<Pncp, Effect.Success<typeof makePncp>>()(
  "dados-publicos-mcp/sources/pncp/store/Pncp"
) {}

export const PncpLive = Layer.effect(Pncp)(makePncp);
