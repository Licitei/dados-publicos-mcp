import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { municipioEconomia } from "../../kernel/db/schemas/municipio-economia";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultAno } from "./catalog";
import { indexAno } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(municipioEconomia),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const economiaView = sql`
  cod_ibge as "codIbge", nome, uf, ano, populacao,
  pib_mil_reais as "pibMilReais",
  case
    when pib_mil_reais is not null and populacao is not null and populacao > 0
    then round((pib_mil_reais * 1000.0 / populacao)::numeric, 2)
    else null
  end as "pibPerCapita"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeIbgeEconomia = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const economiaPorCodigo = (codIbgeInput: string) =>
    db.execute(sql`
      select ${economiaView}
      from ${municipioEconomia}
      where cod_ibge = ${onlyDigits(codIbgeInput)}
      order by ano desc
      limit 1
    `);

  const buscarMunicipio = (nome: string, limit: number) =>
    db.execute(sql`
      select ${economiaView}, word_similarity(${normalize(nome)}, busca) as score
      from ${municipioEconomia}
      where word_similarity(${normalize(nome)}, busca) >= 0.2
      order by score desc, ano desc, cod_ibge
      limit ${sql.raw(String(limit))}
    `);

  const rankingPib = (options: {
    readonly uf?: string;
    readonly ano?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 20, 100);
      const ufWhere: SQL = Match.value(options.uf).pipe(
        Match.when(Match.string, (uf) => sql`and uf = ${uf.toUpperCase()}`),
        Match.orElse(() => sql``)
      );
      const anoWhere: SQL = Match.value(options.ano).pipe(
        Match.when(Match.number, (ano) => sql`and ano = ${ano}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select ${economiaView}
        from ${municipioEconomia}
        where pib_mil_reais is not null ${ufWhere} ${anoWhere}
        order by pib_mil_reais desc, cod_ibge
        limit ${sql.raw(String(limit))}
      `);
    });

  const index = Effect.gen(function* () {
    yield* db.delete(municipioEconomia);
    const inserted = yield* indexAno(defaultAno);
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${municipioEconomia}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return {
    index,
    indexAno: (ano: number) =>
      Effect.gen(function* () {
        yield* db.delete(municipioEconomia);
        const inserted = yield* indexAno(ano);
        return { inserted };
      }),
    economiaPorCodigo,
    buscarMunicipio,
    rankingPib,
  };
});

export class IbgeEconomia extends Context.Service<
  IbgeEconomia,
  Effect.Success<typeof makeIbgeEconomia>
>()("dados-publicos-mcp/IbgeEconomia") {}

export const IbgeEconomiaLive = Layer.effect(IbgeEconomia)(makeIbgeEconomia);
