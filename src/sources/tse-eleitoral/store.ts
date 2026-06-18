import { Clock, Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { bem } from "../../kernel/db/schemas/bem";
import { candidato } from "../../kernel/db/schemas/candidato";
import { despesa } from "../../kernel/db/schemas/despesa";
import { receita } from "../../kernel/db/schemas/receita";
import { receitaOriginario } from "../../kernel/db/schemas/receita-originario";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { ehDocumento, TseError } from "./catalog";
import { indexBens, indexCandidatos, indexPrestacao } from "./indexer";

const doacaoView = sql`
  r.cpf_cnpj_doador as "cpfCnpjDoador", r.nome_doador as "nomeDoador",
  r.ano_eleicao as "anoEleicao", r.sq_candidato as "sqCandidato",
  r.valor, r.data, r.natureza
`;

const despesaView = sql`
  d.cpf_cnpj_forn as "cpfCnpjForn", d.nome_forn as "nomeForn",
  d.ano_eleicao as "anoEleicao", d.sq_candidato as "sqCandidato",
  d.valor, d.data, d.descricao
`;

const candidatoInfo = {
  sqCandidato: true,
  nome: true,
  cargoDescricao: true,
  ufSigla: true,
  partidoSigla: true,
} as const;

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

  const enrichCandidato = (rows: readonly Record<string, unknown>[]) =>
    Effect.gen(function* () {
      const sqs = rows
        .map((row) => row.sqCandidato)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      const cands = yield* db.query.candidato.findMany({
        where: { sqCandidato: { in: sqs } },
        columns: candidatoInfo,
      });
      const byId = new Map(cands.map((c) => [c.sqCandidato, c]));
      return rows.map((row): Record<string, unknown> => {
        const c = byId.get(
          typeof row.sqCandidato === "string" ? row.sqCandidato : ""
        );
        return {
          ...row,
          nomeCandidato: c?.nome ?? null,
          cargoCandidato: c?.cargoDescricao ?? null,
          ufCandidato: c?.ufSigla ?? null,
          partidoCandidato: c?.partidoSigla ?? null,
        };
      });
    });

  const docDoacoes = (doc: string, limit: number, anoAnd: SQL) =>
    db.execute(sql`
      select ${doacaoView}, r.valor as score
      from ${receita} r
      where r.cpf_cnpj_doador = ${doc} ${anoAnd}
      order by r.valor desc nulls last
      limit ${sql.raw(String(limit))}
    `);

  const bm25Doacoes = (q: string, limit: number, anoWhere: SQL) =>
    db.execute(sql`
      select ${doacaoView}, -r.rk as score
      from (
        select
          cpf_cnpj_doador, nome_doador, ano_eleicao, sq_candidato, valor,
          data, natureza, row_number() over () as rk
        from (
          select
            cpf_cnpj_doador, nome_doador, ano_eleicao, sq_candidato, valor,
            data, natureza
          from ${receita}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) r
      ${anoWhere}
      order by r.rk
      limit ${sql.raw(String(limit))}
    `);

  const trgmDoacoes = (q: string, limit: number, anoAnd: SQL) =>
    db.execute(sql`
      select ${doacaoView}, word_similarity(${q}, r.busca) as score
      from ${receita} r
      where word_similarity(${q}, r.busca) >= 0.2 ${anoAnd}
      order by score desc, r.valor desc nulls last
      limit ${sql.raw(String(limit))}
    `);

  const buscarDoacoes = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const anoWhere = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`where r.ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const anoAnd = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`and r.ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const rows = yield* Match.value(ehDocumento(termo)).pipe(
        Match.when(true, () => docDoacoes(onlyDigits(termo), limit, anoAnd)),
        Match.orElse(() =>
          Effect.gen(function* () {
            const q = normalize(termo);
            const lexical = yield* bm25Doacoes(q, limit, anoWhere);
            return yield* Match.value(lexical.length).pipe(
              Match.when(0, () => trgmDoacoes(q, limit, anoAnd)),
              Match.orElse(() => Effect.succeed(lexical))
            );
          })
        )
      );
      return yield* enrichCandidato(rows);
    });

  const docFornecedor = (doc: string, limit: number, anoAnd: SQL) =>
    db.execute(sql`
      select ${despesaView}, d.valor as score
      from ${despesa} d
      where d.cpf_cnpj_forn = ${doc} ${anoAnd}
      order by d.valor desc nulls last
      limit ${sql.raw(String(limit))}
    `);

  const bm25Fornecedor = (q: string, limit: number, anoWhere: SQL) =>
    db.execute(sql`
      select ${despesaView}, -d.rk as score
      from (
        select
          cpf_cnpj_forn, nome_forn, ano_eleicao, sq_candidato, valor,
          data, descricao, row_number() over () as rk
        from (
          select
            cpf_cnpj_forn, nome_forn, ano_eleicao, sq_candidato, valor,
            data, descricao
          from ${despesa}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) d
      ${anoWhere}
      order by d.rk
      limit ${sql.raw(String(limit))}
    `);

  const trgmFornecedor = (q: string, limit: number, anoAnd: SQL) =>
    db.execute(sql`
      select ${despesaView}, word_similarity(${q}, d.busca) as score
      from ${despesa} d
      where word_similarity(${q}, d.busca) >= 0.2 ${anoAnd}
      order by score desc, d.valor desc nulls last
      limit ${sql.raw(String(limit))}
    `);

  const buscarFornecedorCampanha = (
    termo: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const anoWhere = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`where d.ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const anoAnd = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`and d.ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      const rows = yield* Match.value(ehDocumento(termo)).pipe(
        Match.when(true, () => docFornecedor(onlyDigits(termo), limit, anoAnd)),
        Match.orElse(() =>
          Effect.gen(function* () {
            const q = normalize(termo);
            const lexical = yield* bm25Fornecedor(q, limit, anoWhere);
            return yield* Match.value(lexical.length).pipe(
              Match.when(0, () => trgmFornecedor(q, limit, anoAnd)),
              Match.orElse(() => Effect.succeed(lexical))
            );
          })
        )
      );
      return yield* enrichCandidato(rows);
    });

  const rastrearDoadorOriginario = (
    cpfCnpj: string,
    options?: { readonly ano?: number; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const doc = onlyDigits(cpfCnpj);
      const anoAnd = Match.value(options?.ano).pipe(
        Match.when(Match.number, (ano) => sql`and o.ano_eleicao = ${ano}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select
          o.cpf_cnpj_orig as "cpfCnpjOrig", o.nome_orig as "nomeOrig",
          o.tipo_orig as "tipoOrig", o.ano_eleicao as "anoEleicao",
          o.valor as "valorOriginario", o.data,
          r.cpf_cnpj_doador as "repassadorCpfCnpj",
          r.nome_doador as "repassadorNome", r.sq_candidato as "sqCandidato",
          r.valor as "valorRecebidoCandidato",
          c.nome as "nomeCandidato", c.cargo_descricao as "cargoCandidato",
          c.uf_sigla as "ufCandidato", c.partido_sigla as "partidoCandidato"
        from ${receitaOriginario} o
        left join ${receita} r on r.sq_receita = o.sq_receita
        left join ${candidato} c on c.sq_candidato = r.sq_candidato
        where o.cpf_cnpj_orig = ${doc} ${anoAnd}
        order by o.valor desc nulls last
        limit ${sql.raw(String(limit))}
      `);
    });

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      yield* db.delete(candidato);
      yield* db.delete(bem);
      yield* db.delete(receita);
      yield* db.delete(despesa);
      yield* db.delete(receitaOriginario);
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            yield* indexCandidatos(ano);
            yield* indexBens(ano);
            yield* indexPrestacao(ano);
          }),
        { concurrency: 1, discard: true }
      );
      const candidatos = yield* db.execute(
        sql`select count(*)::int as count from ${candidato}`
      );
      const bens = yield* db.execute(
        sql`select count(*)::int as count from ${bem}`
      );
      const receitas = yield* db.execute(
        sql`select count(*)::int as count from ${receita}`
      );
      const despesas = yield* db.execute(
        sql`select count(*)::int as count from ${despesa}`
      );
      const originarios = yield* db.execute(
        sql`select count(*)::int as count from ${receitaOriginario}`
      );
      return {
        candidatos: Number(candidatos[0].count),
        bens: Number(bens[0].count),
        receitas: Number(receitas[0].count),
        despesas: Number(despesas[0].count),
        originarios: Number(originarios[0].count),
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
    buscarDoacoes,
    buscarFornecedorCampanha,
    rastrearDoadorOriginario,
  };
});

export class TseEleitoral extends Context.Service<
  TseEleitoral,
  Effect.Success<typeof makeTse>
>()("dados-publicos-mcp/TseEleitoral") {}

export const TseEleitoralLive = Layer.effect(TseEleitoral)(makeTse);
