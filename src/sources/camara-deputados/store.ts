import { Clock, Context, DateTime, Effect, Layer, Match, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { cosineDistance, sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { cota } from "../../kernel/db/schemas/despesa-camara";
import { deputado } from "../../kernel/db/schemas/deputado";
import { proposicao } from "../../kernel/db/schemas/proposicao";
import { proposicaoAutor } from "../../kernel/db/schemas/proposicao-autor";
import { EmbedError, Embedder } from "../../kernel/embed/embedder";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  CamaraError,
  CEAP_ANO_MAX,
  ehDocumento,
  passageProposicao,
} from "./catalog";
import {
  indexCotas,
  indexDeputados,
  indexProposicaoAutores,
  loadProposicoes,
} from "./indexer";

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const rrfK = 60;
const candidates = 50;
const chunkSize = 2_000;

const countOf = (rows: readonly Record<string, unknown>[]) =>
  pipe(
    Arr.head(rows),
    Option.match({
      onNone: () => 0,
      onSome: (row) => Number(row.count),
    })
  );

const firstVector = (vectors: readonly number[][]) =>
  Effect.fromOption(Arr.head(vectors), () =>
    EmbedError.make({ code: "embed.RUN" })
  );

const deputadoColumns = {
  id: true,
  uri: true,
  nome: true,
  nomeCivil: true,
  siglaSexo: true,
  dataNascimento: true,
  dataFalecimento: true,
  ufNascimento: true,
  municipioNascimento: true,
  idLegislaturaInicial: true,
  idLegislaturaFinal: true,
} as const;

const cotaView = sql`
  nu_deputado_id as "nuDeputadoId", nome_parlamentar as "nomeParlamentar",
  sg_uf as "sgUf", sg_partido as "sgPartido",
  txt_descricao as "txtDescricao", txt_fornecedor as "txtFornecedor",
  cnpj_cpf as "cnpjCpf", cnpj_cpf_norm as "cnpjCpfNorm",
  dat_emissao as "datEmissao", vlr_documento as "vlrDocumento",
  vlr_glosa as "vlrGlosa", vlr_liquido as "vlrLiquido",
  num_mes as "numMes", num_ano as "numAno",
  ide_documento as "ideDocumento", url_documento as "urlDocumento"
`;

const proposicaoView = sql`
  c.id, c.uri, c.sigla_tipo as "siglaTipo", c.numero, c.ano,
  c.ementa, c.ementa_detalhada as "ementaDetalhada", c.keywords,
  c.data_apresentacao as "dataApresentacao", c.situacao,
  c.ultimo_status_data as "ultimoStatusData",
  c.ultimo_status_orgao as "ultimoStatusOrgao"
`;

const makeCamara = Effect.gen(function* () {
  const db = yield* Db;
  const embedder = yield* Embedder;

  const trgmDeputados = (q: string, limit: number, idAnd: SQL, ufAnd: SQL) =>
    db.execute(sql`
      select
        id, uri, nome, nome_civil as "nomeCivil", sigla_sexo as "siglaSexo",
        data_nascimento as "dataNascimento",
        data_falecimento as "dataFalecimento",
        uf_nascimento as "ufNascimento",
        municipio_nascimento as "municipioNascimento",
        id_legislatura_inicial as "idLegislaturaInicial",
        id_legislatura_final as "idLegislaturaFinal",
        word_similarity(${q}, nome_norm) as score
      from ${deputado}
      where word_similarity(${q}, nome_norm) >= 0.2 ${idAnd} ${ufAnd}
      order by score desc, nome
      limit ${sql.raw(String(limit))}
    `).pipe(Effect.map(({ rows }) => rows));

  const buscarDeputado = (input: {
    readonly nome?: string;
    readonly id?: string;
    readonly uf?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(input.limit, 20, 200);
      const id =
        input.id !== undefined && input.id !== "" ? input.id : undefined;
      const uf =
        input.uf !== undefined && input.uf !== ""
          ? pipe(input.uf, Str.trim, Str.toUpperCase)
          : undefined;
      return yield* Match.value(Boolean(input.nome)).pipe(
        Match.when(true, () => {
          const q = normalize(input.nome ?? "");
          const idAnd = Match.value(id).pipe(
            Match.when(Match.string, (value) => sql`and id = ${value}`),
            Match.orElse(() => sql``)
          );
          const ufAnd = Match.value(uf).pipe(
            Match.when(Match.string, (value) => sql`and uf_nascimento = ${value}`),
            Match.orElse(() => sql``)
          );
          return trgmDeputados(q, limit, idAnd, ufAnd);
        }),
        Match.orElse(() => {
          const where = {
            ...Match.value(id).pipe(
              Match.when(Match.string, (value) => ({ id: value })),
              Match.orElse(() => ({}))
            ),
            ...Match.value(uf).pipe(
              Match.when(Match.string, (value) => ({ ufNascimento: value })),
              Match.orElse(() => ({}))
            ),
          };
          return db.query.deputado
            .findMany({
              where,
              columns: deputadoColumns,
              orderBy: (d, { asc }) => asc(d.nome),
              limit,
            })
            .pipe(
              Effect.map((rows) =>
                pipe(
                  rows,
                  Arr.map((row): Record<string, unknown> => ({ ...row }))
                )
              )
            );
        })
      );
    });

  const enrichDeputadoOnCota = (rows: readonly Record<string, unknown>[]) =>
    Effect.gen(function* () {
      const ids = pipe(
        rows,
        Arr.map((row) =>
          row.nuDeputadoId === null || row.nuDeputadoId === undefined
            ? ""
            : String(row.nuDeputadoId)
        ),
        Arr.filter((value) => value.length > 0)
      );
      const deputados = yield* db.query.deputado.findMany({
        where: { id: { in: ids } },
        columns: { id: true, nome: true, ufNascimento: true },
      });
      const byId = new Map(
        pipe(
          deputados,
          Arr.map((d) => [d.id, d] as const)
        )
      );
      return pipe(rows, Arr.map((row): Record<string, unknown> => {
        const d = byId.get(
          row.nuDeputadoId === null || row.nuDeputadoId === undefined
            ? ""
            : String(row.nuDeputadoId)
        );
        return {
          ...row,
          nomeDeputado: d?.nome ?? null,
          ufDeputado: d?.ufNascimento ?? null,
        };
      }));
    });

  const docCota = (doc: string, limit: number, anoAnd: SQL, categoriaAnd: SQL) =>
    db.execute(sql`
      select ${cotaView}, vlr_liquido as score
      from ${cota}
      where cnpj_cpf_norm = ${doc} ${anoAnd} ${categoriaAnd}
      order by vlr_liquido desc nulls last
      limit ${sql.raw(String(limit))}
    `).pipe(Effect.map(({ rows }) => rows));

  const bm25Cota = (q: string, limit: number, anoWhere: SQL, categoriaWhere: SQL) =>
    db.execute(sql`
      select ${cotaView}, -rk as score
      from (
        select
          nu_deputado_id, nome_parlamentar, sg_uf, sg_partido, txt_descricao,
          txt_fornecedor, cnpj_cpf, cnpj_cpf_norm, dat_emissao, vlr_documento,
          vlr_glosa, vlr_liquido, num_mes, num_ano, ide_documento, url_documento,
          row_number() over () as rk
        from (
          select
            nu_deputado_id, nome_parlamentar, sg_uf, sg_partido, txt_descricao,
            txt_fornecedor, cnpj_cpf, cnpj_cpf_norm, dat_emissao, vlr_documento,
            vlr_glosa, vlr_liquido, num_mes, num_ano, ide_documento, url_documento
          from ${cota}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      ${anoWhere} ${categoriaWhere}
      order by rk
    `).pipe(Effect.map(({ rows }) => rows));

  const trgmCota = (q: string, limit: number, anoAnd: SQL, categoriaAnd: SQL) =>
    db.execute(sql`
      select ${cotaView}, word_similarity(${q}, busca) as score
      from ${cota}
      where word_similarity(${q}, busca) >= 0.2 ${anoAnd} ${categoriaAnd}
      order by score desc, vlr_liquido desc nulls last
      limit ${sql.raw(String(limit))}
    `).pipe(Effect.map(({ rows }) => rows));

  const gastosPorFornecedor = (input: {
    readonly fornecedor?: string;
    readonly cnpjCpf?: string;
    readonly ano?: number;
    readonly categoria?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(input.limit, 20, 100);
      const anoWhere = Match.value(input.ano).pipe(
        Match.when(Match.number, (ano) => sql`where num_ano = ${ano}`),
        Match.orElse(() => sql``)
      );
      const anoAnd = Match.value(input.ano).pipe(
        Match.when(Match.number, (ano) => sql`and num_ano = ${ano}`),
        Match.orElse(() => sql``)
      );
      const hasAnoFilter = input.ano !== undefined;
      const categoriaCondition = Match.value(input.categoria).pipe(
        Match.when(Match.string, (categoria) =>
          sql`txt_descricao ilike ${`%${categoria}%`}`
        ),
        Match.orElse(() => undefined)
      );
      const categoriaWhere = Match.value(categoriaCondition).pipe(
        Match.when(Match.undefined, () => sql``),
        Match.orElse((condition) =>
          hasAnoFilter ? sql`and ${condition}` : sql`where ${condition}`
        )
      );
      const categoriaAnd = Match.value(categoriaCondition).pipe(
        Match.when(Match.undefined, () => sql``),
        Match.orElse((condition) => sql`and ${condition}`)
      );
      const doc = Match.value(input.cnpjCpf).pipe(
        Match.when(Match.string, (value) => onlyDigits(value)),
        Match.orElse(() =>
          Match.value(input.fornecedor).pipe(
            Match.when(
              (value): value is string =>
                typeof value === "string" && ehDocumento(value),
              (value) => onlyDigits(value)
            ),
            Match.orElse(() => undefined)
          )
        )
      );
      const rows = yield* Match.value(doc).pipe(
        Match.when(Match.string, (value) =>
          docCota(value, limit, anoAnd, categoriaAnd)
        ),
        Match.orElse(() =>
          Match.value(input.fornecedor).pipe(
            Match.when(Match.string, (fornecedor) =>
              Effect.gen(function* () {
                const q = normalize(fornecedor);
                const lexical = yield* bm25Cota(
                  q,
                  limit,
                  anoWhere,
                  categoriaWhere
                );
                return yield* Match.value(lexical.length).pipe(
                  Match.when(0, () =>
                    trgmCota(q, limit, anoAnd, categoriaAnd)
                  ),
                  Match.orElse(() => Effect.succeed(lexical))
                );
              })
            ),
            Match.orElse(() =>
              Effect.fail(CamaraError.make({ code: "camara.MISSING_FILTRO" }))
            )
          )
        )
      );
      return yield* enrichDeputadoOnCota(rows);
    });

  const fornecedorCotaParlamentar = (input: {
    readonly cnpjCpf: string;
    readonly ano?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(input.cnpjCpf);
      const limit = clamp(input.limit, 50, 500);
      const anoAnd = Match.value(input.ano).pipe(
        Match.when(Match.number, (ano) => sql`and num_ano = ${ano}`),
        Match.orElse(() => sql``)
      );
      const deputados = yield* db.execute(sql`
        select
          nu_deputado_id as "deputadoId",
          max(nome_parlamentar) as "nomeParlamentar",
          max(sg_uf) as uf, max(sg_partido) as partido,
          count(*)::int as documentos,
          sum(vlr_liquido) as "totalLiquido"
        from ${cota}
        where cnpj_cpf_norm = ${alvo} ${anoAnd}
        group by nu_deputado_id
        order by "totalLiquido" desc nulls last
        limit ${sql.raw(String(limit))}
      `).pipe(Effect.map(({ rows }) => rows));
      const totals = yield* db.execute(sql`
        select
          count(*)::int as "totalDocumentos",
          sum(vlr_liquido) as "totalLiquido",
          max(txt_fornecedor) as fornecedor
        from ${cota}
        where cnpj_cpf_norm = ${alvo} ${anoAnd}
      `).pipe(Effect.map(({ rows }) => rows));
      const summary = totals[0] ?? {};
      return {
        cnpjCpf: alvo,
        fornecedor:
          typeof summary.fornecedor === "string" ? summary.fornecedor : null,
        ano: input.ano ?? null,
        totalDocumentos: Number(summary.totalDocumentos ?? 0),
        totalLiquido: Number(summary.totalLiquido ?? 0),
        deputados,
      };
    });

  const enrichAutores = (rows: readonly Record<string, unknown>[]) =>
    Effect.gen(function* () {
      const ids = pipe(
        rows,
        Arr.map((row) =>
          typeof row.id === "string" ? row.id : String(row.id ?? "")
        ),
        Arr.filter((value) => value.length > 0)
      );
      const autores = yield* db.query.proposicaoAutor.findMany({
        where: { idProposicao: { in: ids } },
        columns: {
          idProposicao: true,
          idDeputadoAutor: true,
          nomeAutor: true,
          proponente: true,
        },
      });
      const byProp = Arr.groupBy(autores, (autor) => autor.idProposicao ?? "");
      return pipe(
        rows,
        Arr.map((row): Record<string, unknown> => ({
          ...row,
          autores: pipe(
            Rec.get(
              byProp,
              typeof row.id === "string" ? row.id : String(row.id ?? "")
            ),
            Option.getOrElse((): readonly Record<string, unknown>[] => [])
          ),
        }))
      );
    });

  const buscarProposicao = (input: {
    readonly termo: string;
    readonly ano?: number;
    readonly tipo?: string;
    readonly incluirAutores?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const q = normalize(input.termo);
      const limit = clamp(input.limit, 20, 200);
      const queryVector = yield* embedder
        .embed("query", [input.termo])
        .pipe(Effect.flatMap(firstVector));
      const anoFilter = Match.value(input.ano).pipe(
        Match.when(Match.number, (ano) => sql`c.ano = ${ano}`),
        Match.orElse(() => undefined)
      );
      const tipoFilter = Match.value(input.tipo).pipe(
        Match.when(Match.string, (tipo) =>
          sql`c.sigla_tipo = ${pipe(tipo, Str.trim, Str.toUpperCase)}`
        ),
        Match.orElse(() => undefined)
      );
      const filters = pipe(
        [anoFilter, tipoFilter],
        Arr.filter((value): value is SQL => value !== undefined)
      );
      const outerWhere = Match.value(filters.length).pipe(
        Match.when(0, () => sql``),
        Match.orElse(() => sql`where ${sql.join(filters, sql` and `)}`)
      );
      const rows = yield* db.execute(sql`
        with bm as (
          select id, rk from (
            select id, row_number() over () as rk
            from (
              select id
              from ${proposicao}
              order by busca <@> to_bm25query(${q})
              limit ${sql.raw(String(candidates))}
            ) ranked
          ) s
        ),
        vec as (
          select id, row_number() over (order by dist) as rk
          from (
            select id, ${cosineDistance(proposicao.embedding, queryVector)} as dist
            from ${proposicao}
            where embedding is not null
            order by dist
            limit ${sql.raw(String(candidates))}
          ) ranked
        )
        select
          ${proposicaoView},
          coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
            + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
        from bm
        full outer join vec on bm.id = vec.id
        join ${proposicao} c on c.id = coalesce(bm.id, vec.id)
        ${outerWhere}
        order by score desc, c.id
        limit ${sql.raw(String(limit))}
      `).pipe(Effect.map(({ rows }) => rows));
      return yield* Match.value(Boolean(input.incluirAutores)).pipe(
        Match.when(true, () => enrichAutores(rows)),
        Match.orElse(() => Effect.succeed(rows))
      );
    });

  const indexProposicoes = (ano: number) =>
    Effect.gen(function* () {
      const flat = yield* loadProposicoes(ano);
      const embeddings = yield* Match.value(flat.length).pipe(
        Match.when(0, () => Effect.succeed([])),
        Match.orElse(() => embedder.embed("passage", pipe(flat, Arr.map(passageProposicao))))
      );
      const rows = Arr.zipWith(flat, embeddings, (row, embedding) => ({
        ...row,
        embedding,
      }));
      yield* Effect.forEach(
        pipe(rows, Arr.chunksOf(chunkSize)),
        (batch) => db.insert(proposicao).values([...batch]),
        { concurrency: 1, discard: true }
      );
      return rows.length;
    });

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      yield* db.delete(deputado);
      yield* db.delete(cota);
      yield* db.delete(proposicao);
      yield* db.delete(proposicaoAutor);
      yield* indexDeputados;
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            yield* indexCotas(ano);
            yield* indexProposicoes(ano);
            yield* indexProposicaoAutores(ano);
          }),
        { concurrency: 1, discard: true }
      );
      const deputados = yield* db.execute(
        sql`select count(*)::int as count from ${deputado}`
      ).pipe(Effect.map(({ rows }) => rows));
      const cotas = yield* db.execute(
        sql`select count(*)::int as count from ${cota}`
      ).pipe(Effect.map(({ rows }) => rows));
      const proposicoes = yield* db.execute(
        sql`select count(*)::int as count from ${proposicao}`
      ).pipe(Effect.map(({ rows }) => rows));
      const proposicoesAutores = yield* db.execute(
        sql`select count(*)::int as count from ${proposicaoAutor}`
      ).pipe(Effect.map(({ rows }) => rows));
      return {
        deputados: countOf(deputados),
        cotas: countOf(cotas),
        proposicoes: countOf(proposicoes),
        proposicoesAutores: countOf(proposicoesAutores),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([
      Math.min(
        DateTime.toPartsUtc(DateTime.makeUnsafe(millis)).year,
        CEAP_ANO_MAX
      ),
    ])
  );

  return {
    index,
    indexAll: index,
    indexAnos,
    buscarDeputado,
    gastosPorFornecedor,
    fornecedorCotaParlamentar,
    buscarProposicao,
  };
});

export class CamaraDeputados extends Context.Service<
  CamaraDeputados,
  Effect.Success<typeof makeCamara>
>()("dados-publicos-mcp/sources/camara-deputados/store/CamaraDeputados") {}

export const CamaraDeputadosLive = Layer.effect(CamaraDeputados)(makeCamara);
