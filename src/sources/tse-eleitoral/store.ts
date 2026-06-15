import { Clock, Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { bem } from "../../kernel/db/schemas/bem";
import { candidato } from "../../kernel/db/schemas/candidato";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { TseError } from "./catalog";
import { indexBens, indexCandidatos } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    [...tableDdl(candidato), ...tableDdl(bem)],
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const candidatoColumns = {
  sqCandidato: true,
  cpf: true,
  nome: true,
  nomeUrna: true,
  anoEleicao: true,
  ufSigla: true,
  cargoDescricao: true,
  partidoSigla: true,
  situacaoTurno: true,
  dataNascimento: true,
  ocupacao: true,
} as const;

const bemColumns = {
  sqCandidato: true,
  anoEleicao: true,
  tipoDescricao: true,
  descricao: true,
  valor: true,
} as const;

const candidatoView = sql`
  sq_candidato as "sqCandidato", cpf, nome, nome_urna as "nomeUrna",
  ano_eleicao as "anoEleicao", uf_sigla as "ufSigla",
  cargo_descricao as "cargoDescricao", partido_sigla as "partidoSigla",
  situacao_turno as "situacaoTurno"
`;

const makeTse = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const bm25Candidatos = (q: string, limit: number, anoWhere: SQL) =>
    db.execute(sql`
      select ${candidatoView}, -rk as score
      from (
        select
          sq_candidato, cpf, nome, nome_urna, ano_eleicao, uf_sigla,
          cargo_descricao, partido_sigla, situacao_turno,
          row_number() over () as rk
        from (
          select
            sq_candidato, cpf, nome, nome_urna, ano_eleicao, uf_sigla,
            cargo_descricao, partido_sigla, situacao_turno
          from ${candidato}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      ${anoWhere}
      order by rk
    `);

  const trgmCandidatos = (q: string, limit: number, anoAnd: SQL) =>
    db.execute(sql`
      select ${candidatoView}, word_similarity(${q}, busca) as score
      from ${candidato}
      where word_similarity(${q}, busca) >= 0.2 ${anoAnd}
      order by score desc, sq_candidato
      limit ${sql.raw(String(limit))}
    `);

  const buscarCandidato = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 20, 100);
      const anoWhere = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`where ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const anoAnd = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`and ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const lexical = yield* bm25Candidatos(q, limit, anoWhere);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmCandidatos(q, limit, anoAnd)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const dueDiligenceCandidato = (input: {
    readonly cpf?: string;
    readonly sqCandidato?: string;
    readonly ano?: number;
  }) =>
    Effect.gen(function* () {
      const sq = input.sqCandidato || undefined;
      const cpf = input.cpf || undefined;
      const hasIdentifier = Boolean(sq) || Boolean(cpf);
      yield* Match.value(hasIdentifier).pipe(
        Match.when(false, () =>
          Effect.fail(new TseError({ code: "tse.MISSING_IDENTIFIER" }))
        ),
        Match.orElse(() => Effect.void)
      );
      const where = {
        ...Match.value(sq).pipe(
          Match.when(Match.string, (value) => ({ sqCandidato: value })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(sq ? undefined : cpf).pipe(
          Match.when(Match.string, (value) => ({ cpf: onlyDigits(value) })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(input.ano).pipe(
          Match.when(Match.number, (ano) => ({ anoEleicao: ano })),
          Match.orElse(() => ({}))
        ),
      };
      const candidaturas = yield* db.query.candidato.findMany({
        where,
        columns: candidatoColumns,
        orderBy: (c, { desc }) => desc(c.anoEleicao),
      });
      const sqs = candidaturas
        .map((c) => c.sqCandidato)
        .filter((value): value is string => Boolean(value));
      const bens = yield* db.query.bem.findMany({
        where: { sqCandidato: { in: sqs } },
        columns: bemColumns,
        orderBy: (b, { desc }) => desc(b.valor),
      });
      const totalBensDeclarado = bens.reduce(
        (acc, item) => acc + (item.valor ?? 0),
        0
      );
      return { candidaturas, bens, totalBensDeclarado };
    });

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      yield* db.delete(candidato);
      yield* db.delete(bem);
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            yield* indexCandidatos(ano);
            yield* indexBens(ano);
          }),
        { concurrency: 1, discard: true }
      );
      const candidatos = yield* db.execute(
        sql`select count(*)::int as count from ${candidato}`
      );
      const bens = yield* db.execute(
        sql`select count(*)::int as count from ${bem}`
      );
      return {
        candidatos: Number(candidatos[0].count),
        bens: Number(bens[0].count),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([new Date(millis).getFullYear()])
  );

  return {
    index,
    indexAll: index,
    indexAnos,
    buscarCandidato,
    dueDiligenceCandidato,
  };
});

export class TseEleitoral extends Context.Service<
  TseEleitoral,
  Effect.Success<typeof makeTse>
>()("dados-publicos-mcp/TseEleitoral") {}

export const TseEleitoralLive = Layer.effect(TseEleitoral)(makeTse);
