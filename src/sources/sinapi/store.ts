import { Http } from "../../kernel/http/client";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { defaultReferencia, indexReferencia } from "./indexer";

export const sinapiInsumoTable: DuckTable = {
  name: "sinapi_insumo",
  key: "id",
  columns: {
    id: "VARCHAR",
    mesReferencia: "VARCHAR",
    codigo: "VARCHAR",
    descricao: "VARCHAR",
    unidade: "VARCHAR",
    origem: "VARCHAR",
    classificacao: "VARCHAR",
    uf: "VARCHAR",
    precoMediano: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const makeSinapi = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const load = (ano: number, mes: number) =>
    Effect.gen(function* () {
      const flat = yield* indexReferencia(ano, mes).pipe(Effect.provideService(Http, http));
      const rows = Arr.map(flat, (row, position) => ({ ...row, id: String(position) }));
      const loaded = yield* duck.replace(sinapiInsumoTable, rows);
      yield* refreshSearch(sinapiInsumoTable).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return loaded;
    });

  const index = Effect.gen(function* () {
    const referencia = yield* defaultReferencia.pipe(Effect.provideService(Http, http));
    const inserted = yield* load(referencia.ano, referencia.mes);
    return { inserted, total: yield* duck.count(sinapiInsumoTable) };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      const referencia = yield* defaultReferencia.pipe(Effect.provideService(Http, http));
      const inserted = yield* load(ano, referencia.mes);
      return { inserted };
    });

  const indexReferenciaStore = (ano: number, mes: number) =>
    load(ano, mes).pipe(Effect.map((inserted) => ({ inserted })));

  return { index, indexAno, indexReferencia: indexReferenciaStore };
});

export class Sinapi extends Context.Service<Sinapi, Effect.Success<typeof makeSinapi>>()(
  "dados-publicos-mcp/sources/sinapi/store/Sinapi"
) {}

export const SinapiLive = Layer.effect(Sinapi)(makeSinapi);
