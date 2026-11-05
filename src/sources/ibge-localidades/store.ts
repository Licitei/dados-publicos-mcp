import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { fetchMunicipios } from "./indexer";

export const municipioTable: DuckTable = {
  name: "municipio",
  key: "id",
  columns: {
    id: "VARCHAR",
    nome: "VARCHAR",
    nomeNormalizado: "VARCHAR",
    ufSigla: "VARCHAR",
    ufId: "INTEGER",
    ufNome: "VARCHAR",
    mesorregiaoId: "INTEGER",
    mesorregiaoNome: "VARCHAR",
    regiaoSigla: "VARCHAR",
  },
  search: ["nomeNormalizado"],
};

const makeIbgeLocalidades = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    const flat = yield* fetchMunicipios;
    const loaded = yield* duck.replace(municipioTable, flat);
    yield* fuzzy.write(
      "municipio",
      Arr.map(flat, (row): readonly [string, string] => [row.id, row.nomeNormalizado])
    );
    return loaded;
  });

  return { index };
});

export class IbgeLocalidades extends Context.Service<
  IbgeLocalidades,
  Effect.Success<typeof makeIbgeLocalidades>
>()("dados-publicos-mcp/sources/ibge-localidades/store/IbgeLocalidades") {}

export const IbgeLocalidadesLive = Layer.effect(IbgeLocalidades)(makeIbgeLocalidades);
