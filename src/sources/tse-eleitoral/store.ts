import { Http } from "../../kernel/http/client";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Clock, Context, DateTime, Effect, Layer, pipe } from "effect";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { indexBens, indexCandidatos, indexPrestacao } from "./indexer";

export const candidatoTable: DuckTable = {
  name: "candidato",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpf: "VARCHAR",
    nome: "VARCHAR",
    nomeUrna: "VARCHAR",
    anoEleicao: "INTEGER",
    ufSigla: "VARCHAR",
    ueSigla: "VARCHAR",
    cargoCodigo: "VARCHAR",
    cargoDescricao: "VARCHAR",
    partidoNumero: "VARCHAR",
    partidoSigla: "VARCHAR",
    situacaoTurno: "VARCHAR",
    dataNascimento: "VARCHAR",
    ocupacao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const bemTable: DuckTable = {
  name: "bem",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    ufSigla: "VARCHAR",
    ordem: "VARCHAR",
    tipoCodigo: "VARCHAR",
    tipoDescricao: "VARCHAR",
    descricao: "VARCHAR",
    valor: "DOUBLE",
  },
};

export const receitaTable: DuckTable = {
  name: "receita",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqReceita: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpfCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjDoador: "VARCHAR",
    nomeDoador: "VARCHAR",
    nomeDoadorRfb: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    cnaeDescricao: "VARCHAR",
    ufDoador: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
    origem: "VARCHAR",
    natureza: "VARCHAR",
    recibo: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const despesaTable: DuckTable = {
  name: "despesa",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqDespesa: "VARCHAR",
    sqCandidato: "VARCHAR",
    cpfCandidato: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjForn: "VARCHAR",
    nomeForn: "VARCHAR",
    nomeFornRfb: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    cnaeDescricao: "VARCHAR",
    ufForn: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
    descricao: "VARCHAR",
    documento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const receitaOriginarioTable: DuckTable = {
  name: "receita_originario",
  key: "id",
  columns: {
    id: "VARCHAR",
    sqReceita: "VARCHAR",
    anoEleicao: "INTEGER",
    cpfCnpjOrig: "VARCHAR",
    nomeOrig: "VARCHAR",
    nomeOrigRfb: "VARCHAR",
    tipoOrig: "VARCHAR",
    cnaeCodigo: "VARCHAR",
    valor: "DOUBLE",
    data: "VARCHAR",
  },
};

const makeTse = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        [candidatoTable, bemTable, receitaTable, despesaTable, receitaOriginarioTable],
        (table) => duck.create(table),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            yield* indexCandidatos({ table: candidatoTable, ano }).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            );
            yield* indexBens({ table: bemTable, ano }).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            );
            yield* indexPrestacao({
              tables: {
                receita: receitaTable,
                despesa: despesaTable,
                originario: receitaOriginarioTable,
              },
              ano,
            }).pipe(Effect.provideService(Http, http), Effect.provideService(Duck, duck));
          }),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        [candidatoTable, receitaTable, despesaTable],
        (table) => duck.reindex(table),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach([candidatoTable, receitaTable, despesaTable], refreshSearch, {
        concurrency: 1,
      }).pipe(Effect.provideService(Duck, duck), Effect.provideService(Fuzzy, fuzzy));
      return {
        candidatos: yield* duck.count(candidatoTable),
        bens: yield* duck.count(bemTable),
        receitas: yield* duck.count(receitaTable),
        despesas: yield* duck.count(despesaTable),
        originarios: yield* duck.count(receitaOriginarioTable),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([pipe(DateTime.makeUnsafe(millis), DateTime.getPartUtc("year"))])
  );

  return { index, indexAnos };
});

export class TseEleitoral extends Context.Service<TseEleitoral, Effect.Success<typeof makeTse>>()(
  "dados-publicos-mcp/sources/tse-eleitoral/store/TseEleitoral"
) {}

export const TseEleitoralLive = Layer.effect(TseEleitoral)(makeTse);
