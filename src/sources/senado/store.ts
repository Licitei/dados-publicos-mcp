import { Http } from "../../kernel/http/client";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { defaultAno } from "./catalog";
import { loadCeapsAno, loadSenadores } from "./indexer";

export const senadorTable: DuckTable = {
  name: "senador",
  key: "id",
  columns: {
    id: "VARCHAR",
    codigo: "VARCHAR",
    nome: "VARCHAR",
    nomeCompleto: "VARCHAR",
    sexo: "VARCHAR",
    partido: "VARCHAR",
    uf: "VARCHAR",
    email: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const ceapsTable: DuckTable = {
  name: "ceaps_despesa",
  key: "id",
  columns: {
    id: "VARCHAR",
    ano: "INTEGER",
    mes: "INTEGER",
    senador: "VARCHAR",
    tipoDespesa: "VARCHAR",
    cnpjCpf: "VARCHAR",
    docNormalizado: "VARCHAR",
    fornecedor: "VARCHAR",
    documento: "VARCHAR",
    data: "VARCHAR",
    detalhamento: "VARCHAR",
    valorReembolsado: "DOUBLE",
    codDocumento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const withIds = <A extends object>(prefix: string, rows: readonly A[]) =>
  Arr.map(rows, (row, position) => ({ id: `${prefix}${position}`, ...row }));

const makeSenado = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexCeaps = (ano: number) =>
    Effect.gen(function* () {
      const rows = yield* loadCeapsAno(ano).pipe(Effect.provideService(Http, http));
      yield* duck.transaction(
        duck
          .ensure(ceapsTable)
          .pipe(
            Effect.andThen(duck.run("DELETE FROM ceaps_despesa WHERE ano = ?", [ano])),
            Effect.andThen(duck.append(ceapsTable, withIds(`${ano}-`, rows)))
          )
      );
      yield* duck.reindex(ceapsTable);
      yield* refreshSearch(ceapsTable).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return rows.length;
    });

  const index = Effect.gen(function* () {
    const rows = yield* loadSenadores.pipe(Effect.provideService(Http, http));
    yield* duck.replace(senadorTable, withIds("s", rows));
    yield* refreshSearch(senadorTable).pipe(
      Effect.provideService(Duck, duck),
      Effect.provideService(Fuzzy, fuzzy)
    );
    const ceaps = yield* indexCeaps(defaultAno);
    return { senadores: rows.length, ceaps };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      const ceaps = yield* indexCeaps(ano);
      return { ceaps };
    });

  return { index, indexAno };
});

export class SenadoFederal extends Context.Service<
  SenadoFederal,
  Effect.Success<typeof makeSenado>
>()("dados-publicos-mcp/sources/senado/store/SenadoFederal") {}

export const SenadoFederalLive = Layer.effect(SenadoFederal)(makeSenado);
