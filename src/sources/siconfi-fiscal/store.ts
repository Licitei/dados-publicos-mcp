import { Context, Effect, Layer, Match } from "effect";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { siconfiFato } from "../../kernel/db/schemas/siconfi-fato";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultAno, uniaoEnte } from "./catalog";
import { indexEnte } from "./indexer";

const fatoView = sql`
  id_ente as "idEnte", exercicio, demonstrativo, anexo, rotulo, coluna,
  cod_conta as "codConta", conta, valor, instituicao, uf
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeSiconfiFiscal = Effect.gen(function* () {
  const db = yield* Db;

  const fiscalPorEnte = (
    idEnteInput: string,
    options?: {
      readonly demonstrativo?: string;
      readonly exercicio?: number;
      readonly limit?: number;
    }
  ) =>
    Effect.gen(function* () {
      const idEnte = onlyDigits(idEnteInput);
      const limit = clamp(options?.limit, 200, 1000);
      const demonstrativoWhere: SQL = Match.value(options?.demonstrativo).pipe(
        Match.when(Match.string, (d) => sql`and demonstrativo = ${d.toUpperCase()}`),
        Match.orElse(() => sql``)
      );
      const exercicioWhere: SQL = Match.value(options?.exercicio).pipe(
        Match.when(Match.number, (ano) => sql`and exercicio = ${ano}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select ${fatoView}
        from ${siconfiFato}
        where id_ente = ${idEnte} ${demonstrativoWhere} ${exercicioWhere}
        order by demonstrativo, anexo, cod_conta, coluna
        limit ${sql.raw(String(limit))}
      `);
    });

  const bm25Conta = (q: string, limit: number) =>
    db.execute(sql`
      select ${fatoView}, -rk as score
      from (
        select
          id_ente, exercicio, demonstrativo, anexo, rotulo, coluna, cod_conta,
          conta, valor, instituicao, uf, row_number() over () as rk
        from (
          select
            id_ente, exercicio, demonstrativo, anexo, rotulo, coluna, cod_conta,
            conta, valor, instituicao, uf
          from ${siconfiFato}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmConta = (q: string, limit: number) =>
    db.execute(sql`
      select ${fatoView}, word_similarity(${q}, busca) as score
      from ${siconfiFato}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `);

  const buscarConta = (
    termo: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      const lexical = yield* bm25Conta(q, limit);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmConta(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const indexarEnte = (idEnteInput: string, ano: number) =>
    Effect.gen(function* () {
      const idEnte = onlyDigits(idEnteInput);
      yield* db
        .delete(siconfiFato)
        .where(
          and(eq(siconfiFato.idEnte, idEnte), eq(siconfiFato.exercicio, ano))
        );
      const inserted = yield* indexEnte(idEnte, ano);
      return { idEnte, ano, inserted };
    });

  const indexAno = (ano: number) => indexarEnte(uniaoEnte, ano);

  const index = Effect.gen(function* () {
    yield* db.delete(siconfiFato);
    const inserted = yield* indexEnte(uniaoEnte, defaultAno);
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${siconfiFato}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return { index, indexAno, indexarEnte, fiscalPorEnte, buscarConta };
});

export class SiconfiFiscal extends Context.Service<
  SiconfiFiscal,
  Effect.Success<typeof makeSiconfiFiscal>
>()("dados-publicos-mcp/SiconfiFiscal") {}

export const SiconfiFiscalLive = Layer.effect(SiconfiFiscal)(makeSiconfiFiscal);
