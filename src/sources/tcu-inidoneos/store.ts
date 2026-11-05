import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { tcuInidoneoTable } from "./catalog";
import { indexAll } from "./indexer";

const makeTcuInidoneos = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    yield* duck.create(tcuInidoneoTable);
    const inserted = yield* indexAll;
    yield* duck.reindex(tcuInidoneoTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM tcu_inidoneo`
    );
    yield* fuzzy.write(
      "tcu_inidoneo",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(tcuInidoneoTable) };
  });

  return { index };
});

export class TcuInidoneos extends Context.Service<
  TcuInidoneos,
  Effect.Success<typeof makeTcuInidoneos>
>()("dados-publicos-mcp/sources/tcu-inidoneos/store/TcuInidoneos") {}

export const TcuInidoneosLive = Layer.effect(TcuInidoneos)(makeTcuInidoneos);
