import { Context, Effect, Layer, Option, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { bm25, Duck } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { PrecoFlat, precoPraticadoTable } from "./catalog";
import { indexItens } from "./indexer";
import { clamp } from "../../kernel/duck/search";

const seedLimit = 300;

const AmostraView = PrecoFlat.mapFields(
  Struct.pick([
    "idCompra",
    "codigoItemCatalogo",
    "descricaoItem",
    "precoUnitario",
    "quantidade",
    "unidadeFornecimento",
    "niFornecedor",
    "nomeFornecedor",
    "marca",
    "dataCompra",
    "estado",
    "municipio",
    "codigoUasg",
    "nomeOrgao",
  ])
);

const AmostraHit = Schema.Struct({ ...AmostraView.fields, score: Schema.Finite });

const Stats = Schema.Struct({
  n: Schema.Finite,
  minimo: Schema.NullOr(Schema.Finite),
  maximo: Schema.NullOr(Schema.Finite),
  media: Schema.NullOr(Schema.Finite),
  mediana: Schema.NullOr(Schema.Finite),
});

const viewSelect = `"idCompra", "codigoItemCatalogo", "descricaoItem", "precoUnitario", quantidade, "unidadeFornecimento", "niFornecedor", "nomeFornecedor", marca, "dataCompra", estado, municipio, "codigoUasg", "nomeOrgao"`;

const makePainelPrecos = Effect.gen(function* () {
  const duck = yield* Duck;

  const ufClause = (uf: string | undefined) =>
    pipe(
      Option.fromNullishOr(uf),
      Option.match({
        onNone: () => ({ clause: "", params: Arr.empty<string>() }),
        onSome: (value) => ({ clause: "AND estado = ?", params: [Str.toUpperCase(value)] }),
      })
    );

  const precoPorItem = (
    codigo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 500);
      const uf = ufClause(options?.uf);
      return yield* duck.query(
        AmostraView,
        `SELECT ${viewSelect}
         FROM preco_praticado
         WHERE "codigoItemCatalogo" = ? AND "precoUnitario" IS NOT NULL ${uf.clause}
         ORDER BY "dataCompra" DESC NULLS LAST, "precoUnitario", id
         LIMIT ?`,
        [onlyDigits(codigo), ...uf.params, limit]
      );
    });

  const estatisticaPreco = (codigo: string, options?: { readonly uf?: string }) =>
    Effect.gen(function* () {
      const uf = ufClause(options?.uf);
      const rows = yield* duck.query(
        Stats,
        `SELECT
           count(*)::INTEGER AS n,
           min("precoUnitario")::DOUBLE AS minimo,
           max("precoUnitario")::DOUBLE AS maximo,
           avg("precoUnitario")::DOUBLE AS media,
           median("precoUnitario")::DOUBLE AS mediana
         FROM preco_praticado
         WHERE "codigoItemCatalogo" = ? AND "precoUnitario" IS NOT NULL ${uf.clause}`,
        [onlyDigits(codigo), ...uf.params]
      );
      const first = Arr.head(rows);
      return {
        codigoItemCatalogo: onlyDigits(codigo),
        n: pipe(
          first,
          Option.map((row) => row.n),
          Option.getOrElse(() => 0)
        ),
        minimo: pipe(
          first,
          Option.flatMapNullishOr((row) => row.minimo),
          Option.getOrNull
        ),
        mediana: pipe(
          first,
          Option.flatMapNullishOr((row) => row.mediana),
          Option.getOrNull
        ),
        media: pipe(
          first,
          Option.flatMapNullishOr((row) => row.media),
          Option.getOrNull
        ),
        maximo: pipe(
          first,
          Option.flatMapNullishOr((row) => row.maximo),
          Option.getOrNull
        ),
      };
    });

  const buscarPrecoPorDescricao = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 200);
      const q = normalize(termo);
      return Str.isNonEmpty(q)
        ? yield* duck.query(
            AmostraHit,
            `SELECT ${viewSelect}, score
             FROM (SELECT *, ${bm25(precoPraticadoTable)} AS score FROM preco_praticado)
             WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT ?`,
            [q, limit]
          )
        : [];
    });

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
      const inserted = yield* indexItens({ codigos, firstId });
      yield* duck.reindex(precoPraticadoTable);
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
    indexAll: index,
    indexItens: (codigos: readonly string[]) =>
      harvest(codigos).pipe(Effect.map((inserted) => ({ inserted }))),
    precoPorItem,
    estatisticaPreco,
    buscarPrecoPorDescricao,
  };
});

export class PainelPrecos extends Context.Service<
  PainelPrecos,
  Effect.Success<typeof makePainelPrecos>
>()("dados-publicos-mcp/sources/painel-precos/store/PainelPrecos") {}

export const PainelPrecosLive = Layer.effect(PainelPrecos)(makePainelPrecos);
