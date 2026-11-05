import { Http } from "../../kernel/http/client";
import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { defaultAno } from "./catalog";
import { fetchAno } from "./indexer";

export const municipioEconomiaTable: DuckTable = {
  name: "municipio_economia",
  key: "codIbge",
  columns: {
    codIbge: "VARCHAR",
    nome: "VARCHAR",
    uf: "VARCHAR",
    ano: "INTEGER",
    populacao: "BIGINT",
    pibMilReais: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const makeIbgeEconomia = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const load = (ano: number) =>
    Effect.gen(function* () {
      const rows = yield* fetchAno(ano).pipe(Effect.provideService(Http, http));
      const inserted = yield* duck.replace(municipioEconomiaTable, rows);
      yield* fuzzy.write(
        "municipio_economia",
        Arr.map(rows, (row): readonly [string, string] => [row.codIbge, row.busca])
      );
      return inserted;
    });

  const index = load(defaultAno).pipe(Effect.map((inserted) => ({ inserted, total: inserted })));

  const indexAno = (ano: number) => load(ano).pipe(Effect.map((inserted) => ({ inserted })));

  return { index, indexAno };
});

export class IbgeEconomia extends Context.Service<
  IbgeEconomia,
  Effect.Success<typeof makeIbgeEconomia>
>()("dados-publicos-mcp/sources/ibge-economia/store/IbgeEconomia") {}

export const IbgeEconomiaLive = Layer.effect(IbgeEconomia)(makeIbgeEconomia);
