import { refreshSearch } from "../../kernel/search/index-rows";
import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import { Duck, idsParam, inIds, quoteIdentifier } from "../../kernel/duck/duck";
import { lexicalOrFuzzy } from "../../kernel/duck/search";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize } from "../../kernel/text/normalize";
import { NonEmptyString, positiveIntMax } from "../checks";
import { indexRegistry } from "../index-registry";
import { ToolFailure, defineTool } from "../tool";

const Row = Schema.Record(Schema.String, Schema.Unknown);
const Present = Schema.Struct({ present: Schema.Finite });

export const buscar = defineTool({
  name: "buscar",
  description:
    "Busca textual em qualquer tabela com campos de busca declarados em fontes. Usa bm25 e, sem resultados, busca aproximada. Indexa fontes leves vazias automaticamente; fontes pesadas exigem CLI.",
  input: Schema.Struct({
    tabela: NonEmptyString,
    termo: NonEmptyString,
    limite: Schema.optionalKey(positiveIntMax(1000)),
  }),
  run: (args) =>
    Effect.gen(function* () {
      const found = yield* Effect.fromOption(
        Arr.findFirst(
          Arr.flatMap(Rec.toEntries(indexRegistry), ([fonte, entry]) =>
            Arr.map(entry.tables, (table) => ({ fonte, entry, table }))
          ),
          ({ table }) => table.name === args.tabela && (table.search?.length ?? 0) > 0
        )
      ).pipe(
        Effect.mapError(() =>
          ToolFailure.make({
            text: "Tabela sem busca textual; consulte fontes para descobrir as tabelas disponíveis.",
          })
        )
      );
      const duck = yield* Duck;
      const fuzzy = yield* Fuzzy;
      const { entry, table } = found;
      const count = yield* duck.count(table);
      yield* count === 0 && entry.heavy
        ? Effect.fail(
            ToolFailure.make({
              text: `Fonte pesada sem registros: execute bun src/index.ts index ${found.fonte} na CLI com o escopo desejado.`,
            })
          )
        : Effect.void;
      yield* count === 0 ? entry.run({}) : Effect.void;
      const limit = args.limite ?? 200;
      const termo = normalize(args.termo);
      const fuzzyIds = Effect.gen(function* () {
        const exists = yield* fuzzy.exists(table.name);
        yield* exists ? Effect.void : refreshSearch(table);
        const ids = yield* fuzzy.match(table.name, termo, { limit });
        const present =
          ids.length === 0
            ? []
            : yield* duck.query(
                Present,
                `SELECT 1 AS present FROM ${quoteIdentifier(table.name)} WHERE ${inIds(table.key)} LIMIT 1`,
                [idsParam(ids)]
              );
        const outdated = ids.length > 0 && present.length === 0;
        yield* outdated ? refreshSearch(table) : Effect.void;
        return yield* outdated ? fuzzy.match(table.name, termo, { limit }) : Effect.succeed(ids);
      });
      return yield* lexicalOrFuzzy(
        duck.ranked(Row, table, {
          select: Arr.join(Arr.map(Rec.keys(table.columns), quoteIdentifier), ", "),
          tie: `"${table.key}"`,
          termo,
          limit,
        }),
        fuzzyIds,
        (ids) =>
          duck.query(
            Row,
            `SELECT *, 0::DOUBLE AS score FROM "${table.name}" WHERE ${inIds(table.key)} LIMIT ?`,
            [idsParam(ids), limit]
          ),
        (row) => String(row[table.key])
      );
    }),
});
