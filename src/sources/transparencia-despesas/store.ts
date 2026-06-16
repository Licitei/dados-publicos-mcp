import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { despesaFederal } from "../../kernel/db/schemas/despesa-federal";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultAnoMes, indexMes } from "./indexer";
import { toAnoMes } from "./catalog";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(despesaFederal),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const despesaView = sql`
  ano_mes as "anoMes", cod_orgao_superior as "codOrgaoSuperior",
  nome_orgao_superior as "nomeOrgaoSuperior", cod_orgao as "codOrgao",
  nome_orgao as "nomeOrgao", cod_funcao as "codFuncao",
  nome_funcao as "nomeFuncao", cod_programa as "codPrograma",
  nome_programa as "nomePrograma", cod_acao as "codAcao",
  nome_acao as "nomeAcao", uf, municipio, nome_elemento as "nomeElemento",
  valor_empenhado as "valorEmpenhado", valor_liquidado as "valorLiquidado",
  valor_pago as "valorPago"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeTransparenciaDespesas = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const despesasPorOrgao = (codOrgaoSuperior: string, limit: number) =>
    db.execute(sql`
      select ${despesaView}
      from ${despesaFederal}
      where cod_orgao_superior = ${onlyDigits(codOrgaoSuperior)}
      order by valor_pago desc nulls last, cod_acao
      limit ${sql.raw(String(limit))}
    `);

  const bm25Despesa = (q: string, limit: number, ufWhere: SQL) =>
    db.execute(sql`
      select ${despesaView}, score
      from (
        select
          ano_mes, cod_orgao_superior, nome_orgao_superior, cod_orgao,
          nome_orgao, cod_funcao, nome_funcao, cod_programa, nome_programa,
          cod_acao, nome_acao, uf, municipio, nome_elemento, valor_empenhado,
          valor_liquidado, valor_pago, -rk as score
        from (
          select
            ano_mes, cod_orgao_superior, nome_orgao_superior, cod_orgao,
            nome_orgao, cod_funcao, nome_funcao, cod_programa, nome_programa,
            cod_acao, nome_acao, uf, municipio, nome_elemento, valor_empenhado,
            valor_liquidado, valor_pago, row_number() over () as rk
          from (
            select
              ano_mes, cod_orgao_superior, nome_orgao_superior, cod_orgao,
              nome_orgao, cod_funcao, nome_funcao, cod_programa, nome_programa,
              cod_acao, nome_acao, uf, municipio, nome_elemento, valor_empenhado,
              valor_liquidado, valor_pago
            from ${despesaFederal}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) numbered
      ) scored
      ${ufWhere}
      order by score desc
    `);

  const buscarDespesa = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      const ufWhere: SQL = Match.value(options?.uf).pipe(
        Match.when(Match.string, (uf) => sql`where uf = ${uf.toUpperCase()}`),
        Match.orElse(() => sql``)
      );
      return yield* bm25Despesa(q, limit, ufWhere);
    });

  const indexMesParam = (anoMes: string) =>
    Effect.gen(function* () {
      yield* db.delete(despesaFederal);
      const inserted = yield* indexMes(anoMes);
      const rows = yield* db.execute(
        sql`select count(*)::int as count from ${despesaFederal}`
      );
      return { anoMes, inserted, total: Number(rows[0].count) };
    });

  const index = Effect.gen(function* () {
    const anoMes = yield* defaultAnoMes;
    return yield* indexMesParam(anoMes);
  });

  return {
    index,
    indexMes: (mes: string) => indexMesParam(toAnoMes(mes)),
    despesasPorOrgao,
    buscarDespesa,
  };
});

export class TransparenciaDespesas extends Context.Service<
  TransparenciaDespesas,
  Effect.Success<typeof makeTransparenciaDespesas>
>()("dados-publicos-mcp/TransparenciaDespesas") {}

export const TransparenciaDespesasLive = Layer.effect(TransparenciaDespesas)(
  makeTransparenciaDespesas
);
