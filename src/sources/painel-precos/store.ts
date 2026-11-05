import { Http } from "../../kernel/http/client";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { precoPraticadoTable } from "./catalog";
import { indexItens } from "./indexer";

const seedLimit = 300;

const makePainelPrecos = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const seedCodigos = duck
    .query(
      Schema.Struct({ codigo: Schema.Finite }),
      `SELECT "codigoItem"::INTEGER AS codigo FROM catmat_material ORDER BY "codigoItem" LIMIT ?`,
      [seedLimit]
    )
    .pipe(
      Effect.map((rows) => Arr.map(rows, (row) => String(row.codigo))),
      Effect.catchTag("DuckError", () => Effect.succeed(Arr.empty<string>()))
    );

  const ensureTable = Effect.gen(function* () {
    const present = yield* duck.query(
      Schema.Struct({ n: Schema.Finite }),
      `SELECT count(*)::INTEGER AS n FROM information_schema.tables WHERE table_name = ?`,
      [precoPraticadoTable.name]
    );
    yield* Option.exists(Arr.head(present), (row) => row.n > 0)
      ? Effect.void
      : duck.create(precoPraticadoTable);
  });

  const nextId = duck
    .query(
      Schema.Struct({ next: Schema.Finite }),
      `SELECT (coalesce(max(id), -1) + 1)::DOUBLE AS next FROM preco_praticado`
    )
    .pipe(
      Effect.map((rows) =>
        Option.getOrElse(
          Option.map(Arr.head(rows), (row) => row.next),
          () => 0
        )
      )
    );

  const harvest = (codigos: readonly string[]) =>
    Effect.gen(function* () {
      yield* ensureTable;
      const firstId = yield* nextId;
      const inserted = yield* indexItens({ codigos, firstId }).pipe(
        Effect.provideService(Http, http),
        Effect.provideService(Duck, duck)
      );
      yield* duck.reindex(precoPraticadoTable);
      yield* refreshSearch(precoPraticadoTable).pipe(
        Effect.provideService(Duck, duck),
        Effect.provideService(Fuzzy, fuzzy)
      );
      return inserted;
    });

  const index = Effect.gen(function* () {
    yield* duck.create(precoPraticadoTable);
    const codigos = yield* seedCodigos;
    const inserted = yield* harvest(codigos);
    return { itens: codigos.length, inserted, total: yield* duck.count(precoPraticadoTable) };
  });

  return {
    index,
    indexItens: (codigos: readonly string[]) =>
      harvest(codigos).pipe(Effect.map((inserted) => ({ inserted }))),
  };
});

export class PainelPrecos extends Context.Service<
  PainelPrecos,
  Effect.Success<typeof makePainelPrecos>
>()("dados-publicos-mcp/sources/painel-precos/store/PainelPrecos") {}

export const PainelPrecosLive = Layer.effect(PainelPrecos)(makePainelPrecos);
