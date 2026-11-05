import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { fornecedorTable } from "./catalog";
import { indexFornecedores } from "./indexer";

const makeSicaf = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const index = Effect.gen(function* () {
    yield* duck.create(fornecedorTable);
    yield* indexFornecedores;
    yield* duck.reindex(fornecedorTable);
    const names = yield* duck.query(
      Schema.Struct({ id: Schema.Finite, busca: Schema.String }),
      `SELECT id::DOUBLE AS id, busca FROM fornecedor`
    );
    yield* fuzzy.write(
      "fornecedor",
      Arr.map(names, (row): readonly [number, string] => [row.id, row.busca])
    );
    return yield* duck.count(fornecedorTable);
  });

  return { index };
});

export class Sicaf extends Context.Service<Sicaf, Effect.Success<typeof makeSicaf>>()(
  "dados-publicos-mcp/sources/sicaf-fornecedores/store/Sicaf"
) {}

export const SicafLive = Layer.effect(Sicaf)(makeSicaf);
