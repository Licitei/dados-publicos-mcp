import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { catmatMaterial } from "../../kernel/db/schemas/catmat-material";
import { precoPraticado } from "../../kernel/db/schemas/preco-praticado";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexItens } from "./indexer";

const seedLimit = 300;

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(precoPraticado),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const amostraView = sql`
  id_compra as "idCompra", codigo_item_catalogo as "codigoItemCatalogo",
  descricao_item as "descricaoItem", preco_unitario as "precoUnitario",
  quantidade, unidade_fornecimento as "unidadeFornecimento",
  ni_fornecedor as "niFornecedor", nome_fornecedor as "nomeFornecedor",
  marca, data_compra as "dataCompra", estado, municipio,
  codigo_uasg as "codigoUasg", nome_orgao as "nomeOrgao"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makePainelPrecos = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const ufClause = (uf: string | undefined) =>
    Match.value(uf).pipe(
      Match.when(Match.string, (value) => sql`and estado = ${value.toUpperCase()}`),
      Match.orElse(() => sql``)
    );

  const precoPorItem = (
    codigo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 500);
      const ufWhere: SQL = ufClause(options?.uf);
      return yield* db.execute(sql`
        select ${amostraView}
        from ${precoPraticado}
        where codigo_item_catalogo = ${onlyDigits(codigo)}
          and preco_unitario is not null ${ufWhere}
        order by data_compra desc nulls last, preco_unitario
        limit ${sql.raw(String(limit))}
      `);
    });

  const estatisticaPreco = (
    codigo: string,
    options?: { readonly uf?: string }
  ) =>
    Effect.gen(function* () {
      const ufWhere: SQL = ufClause(options?.uf);
      const rows = yield* db.execute(sql`
        select
          count(*)::int as n,
          min(preco_unitario) as minimo,
          max(preco_unitario) as maximo,
          avg(preco_unitario) as media,
          percentile_cont(0.5) within group (order by preco_unitario) as mediana
        from ${precoPraticado}
        where codigo_item_catalogo = ${onlyDigits(codigo)}
          and preco_unitario is not null ${ufWhere}
      `);
      return {
        codigoItemCatalogo: onlyDigits(codigo),
        n: Number(rows[0]?.n ?? 0),
        minimo: rows[0]?.minimo ?? null,
        mediana: rows[0]?.mediana ?? null,
        media: rows[0]?.media ?? null,
        maximo: rows[0]?.maximo ?? null,
      };
    });

  const buscarPrecoPorDescricao = (
    termo: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      return yield* db.execute(sql`
        select ${amostraView}, -rk as score
        from (
          select
            id_compra, codigo_item_catalogo, descricao_item, preco_unitario,
            quantidade, unidade_fornecimento, ni_fornecedor, nome_fornecedor,
            marca, data_compra, estado, municipio, codigo_uasg, nome_orgao,
            row_number() over () as rk
          from (
            select
              id_compra, codigo_item_catalogo, descricao_item, preco_unitario,
              quantidade, unidade_fornecimento, ni_fornecedor, nome_fornecedor,
              marca, data_compra, estado, municipio, codigo_uasg, nome_orgao
            from ${precoPraticado}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) scored
        order by rk
      `);
    });

  const seedCodigos = db
    .select({ codigo: catmatMaterial.codigoItem })
    .from(catmatMaterial)
    .limit(seedLimit)
    .pipe(Effect.map((rows) => rows.map((row) => String(row.codigo))));

  const index = Effect.gen(function* () {
    yield* db.delete(precoPraticado);
    const codigos = yield* seedCodigos;
    const inserted = yield* indexItens(codigos);
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${precoPraticado}`
    );
    return { itens: codigos.length, inserted, total: Number(rows[0].count) };
  });

  return {
    index,
    indexAll: index,
    indexItens: (codigos: readonly string[]) =>
      Effect.gen(function* () {
        const inserted = yield* indexItens(codigos);
        return { inserted };
      }),
    precoPorItem,
    estatisticaPreco,
    buscarPrecoPorDescricao,
  };
});

export class PainelPrecos extends Context.Service<
  PainelPrecos,
  Effect.Success<typeof makePainelPrecos>
>()("dados-publicos-mcp/PainelPrecos") {}

export const PainelPrecosLive = Layer.effect(PainelPrecos)(makePainelPrecos);
