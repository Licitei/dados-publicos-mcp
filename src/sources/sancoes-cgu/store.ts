import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { sancaoTable } from "./catalog";
import { indexSnapshots } from "./indexer";

const makeSancoesCgu = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    yield* duck.create(sancaoTable);
    const inserted = yield* indexSnapshots;
    yield* duck.reindex(sancaoTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM sancao`
    );
    yield* fuzzy.write(
      "sancao",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(sancaoTable) };
  });

  return { index };
});

export class SancoesCgu extends Context.Service<
  SancoesCgu,
  Effect.Success<typeof makeSancoesCgu>
>()("dados-publicos-mcp/sources/sancoes-cgu/store/SancoesCgu") {}

export const SancoesCguLive = Layer.effect(SancoesCgu)(makeSancoesCgu);
