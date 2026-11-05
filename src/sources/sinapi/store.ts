import * as Str from "effect/String";
import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { sinapiInsumo } from "../../kernel/db/schemas/sinapi-insumo";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultReferencia, indexReferencia } from "./indexer";

const insumoView = sql`
  mes_referencia as "mesReferencia", codigo, descricao, unidade, origem,
  classificacao, uf, preco_mediano as "precoMediano"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeSinapi = Effect.gen(function* () {
  const db = yield* Db;

  const precoPorCodigo = (codigo: string, uf: string | undefined) =>
    Effect.gen(function* () {
      const ufWhere: SQL = Match.value(uf).pipe(
        Match.when(Match.string, (value) => sql`and uf = ${Str.toUpperCase(value)}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select ${insumoView}
        from ${sinapiInsumo}
        where codigo = ${onlyDigits(codigo)} ${ufWhere}
        order by uf
      `).pipe(Effect.map(({ rows }) => rows));
    });

  const bm25Insumo = (q: string, limit: number, ufWhere: SQL) =>
    db.execute(sql`
      select ${insumoView}, score
      from (
        select
          mes_referencia, codigo, descricao, unidade, origem, classificacao,
          uf, preco_mediano, -rk as score
        from (
          select
            mes_referencia, codigo, descricao, unidade, origem, classificacao,
            uf, preco_mediano, row_number() over () as rk
          from (
            select
              mes_referencia, codigo, descricao, unidade, origem,
              classificacao, uf, preco_mediano
            from ${sinapiInsumo}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) numbered
      ) scored
      ${ufWhere}
      order by score desc
    `).pipe(Effect.map(({ rows }) => rows));

  const buscarInsumo = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      const ufWhere: SQL = Match.value(options?.uf).pipe(
        Match.when(Match.string, (uf) => sql`where uf = ${Str.toUpperCase(uf)}`),
        Match.orElse(() => sql``)
      );
      return yield* bm25Insumo(q, limit, ufWhere);
    });

  const index = Effect.gen(function* () {
    yield* db.delete(sinapiInsumo);
    const referencia = yield* defaultReferencia;
    const inserted = yield* indexReferencia(referencia.ano, referencia.mes);
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${sinapiInsumo}`
    ).pipe(Effect.map(({ rows }) => rows));
    return { inserted, total: Number(rows[0]?.count ?? 0) };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      yield* db.delete(sinapiInsumo);
      const referencia = yield* defaultReferencia;
      const inserted = yield* indexReferencia(ano, referencia.mes);
      return { inserted };
    });

  return {
    index,
    indexAno,
    indexReferencia: (ano: number, mes: number) =>
      Effect.gen(function* () {
        yield* db.delete(sinapiInsumo);
        const inserted = yield* indexReferencia(ano, mes);
        return { inserted };
      }),
    precoPorCodigo,
    buscarInsumo,
  };
});

export class Sinapi extends Context.Service<
  Sinapi,
  Effect.Success<typeof makeSinapi>
>()("dados-publicos-mcp/sources/sinapi/store/Sinapi") {}

export const SinapiLive = Layer.effect(Sinapi)(makeSinapi);
