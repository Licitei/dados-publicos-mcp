import { Clock, Context, Effect, Layer, Match } from "effect";
import { cosineDistance, sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { ata } from "../../kernel/db/schemas/ata";
import { contratacao } from "../../kernel/db/schemas/contratacao";
import { contrato } from "../../kernel/db/schemas/contrato";
import { Embedder } from "../../kernel/embed/embedder";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  defaultModalidades,
  defaultWindowStart,
  PncpError,
  ymd,
} from "./catalog";
import { indexAtas, indexContratacoes, indexContratos } from "./indexer";

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const rrfK = 60;
const candidates = 50;

const contratacaoView = sql`
  c.numero_controle_pncp as "numeroControlePNCP",
  c.ano_compra as "anoCompra", c.objeto_compra as "objetoCompra",
  c.modalidade_id as "modalidadeId", c.modalidade_nome as "modalidadeNome",
  c.situacao_compra_nome as "situacaoCompraNome",
  c.valor_total_estimado as "valorTotalEstimado",
  c.valor_total_homologado as "valorTotalHomologado",
  c.data_publicacao_pncp as "dataPublicacaoPncp",
  c.data_abertura_proposta as "dataAberturaProposta",
  c.data_encerramento_proposta as "dataEncerramentoProposta",
  c.orgao_cnpj as "orgaoCnpj", c.orgao_razao_social as "orgaoRazaoSocial",
  c.codigo_ibge as "codigoIbge", c.municipio_nome as "municipioNome",
  c.uf_sigla as "ufSigla", c.srp
`;

const contratoView = sql`
  c.numero_controle_pncp as "numeroControlePNCP",
  c.ano_contrato as "anoContrato", c.objeto_contrato as "objetoContrato",
  c.ni_fornecedor as "niFornecedor", c.tipo_pessoa as "tipoPessoa",
  c.nome_razao_social_fornecedor as "nomeRazaoSocialFornecedor",
  c.valor_inicial as "valorInicial", c.valor_global as "valorGlobal",
  c.valor_acumulado as "valorAcumulado",
  c.data_assinatura as "dataAssinatura",
  c.data_vigencia_inicio as "dataVigenciaInicio",
  c.data_vigencia_fim as "dataVigenciaFim",
  c.orgao_cnpj as "orgaoCnpj", c.orgao_razao_social as "orgaoRazaoSocial",
  c.uf_sigla as "ufSigla", c.tipo_contrato as "tipoContrato"
`;

const ataView = sql`
  c.numero_controle_pncp_ata as "numeroControlePNCPAta",
  c.numero_controle_pncp_compra as "numeroControlePNCPCompra",
  c.ano_ata as "anoAta",
  c.numero_ata_registro_preco as "numeroAtaRegistroPreco",
  c.objeto_contratacao as "objetoContratacao",
  c.vigencia_inicio as "vigenciaInicio", c.vigencia_fim as "vigenciaFim",
  c.cnpj_orgao as "cnpjOrgao", c.nome_orgao as "nomeOrgao",
  c.codigo_unidade_orgao as "codigoUnidadeOrgao", c.uf_sigla as "ufSigla"
`;

const fornecedorView = sql`
  numero_controle_pncp as "numeroControlePNCP",
  ni_fornecedor as "niFornecedor",
  nome_razao_social_fornecedor as "nomeRazaoSocialFornecedor",
  objeto_contrato as "objetoContrato",
  valor_global as "valorGlobal", valor_inicial as "valorInicial",
  uf_sigla as "ufSigla", orgao_cnpj as "orgaoCnpj",
  orgao_razao_social as "orgaoRazaoSocial"
`;

const fornecedorRankColumns = sql`
  numero_controle_pncp, ni_fornecedor, nome_razao_social_fornecedor,
  objeto_contrato, valor_global, valor_inicial, uf_sigla, orgao_cnpj,
  orgao_razao_social
`;

const contratoColumns = {
  numeroControlePNCP: true,
  objetoContrato: true,
  niFornecedor: true,
  nomeRazaoSocialFornecedor: true,
  valorInicial: true,
  valorGlobal: true,
  valorAcumulado: true,
  dataAssinatura: true,
  dataVigenciaInicio: true,
  dataVigenciaFim: true,
  orgaoCnpj: true,
  orgaoRazaoSocial: true,
  ufSigla: true,
  tipoContrato: true,
  anoContrato: true,
} as const;

const contratacaoColumns = {
  numeroControlePNCP: true,
  objetoCompra: true,
  modalidadeId: true,
  modalidadeNome: true,
  situacaoCompraNome: true,
  valorTotalEstimado: true,
  dataPublicacaoPncp: true,
  dataAberturaProposta: true,
  dataEncerramentoProposta: true,
  orgaoCnpj: true,
  orgaoRazaoSocial: true,
  ufSigla: true,
  municipioNome: true,
  codigoIbge: true,
  srp: true,
} as const;

const makePncp = Effect.gen(function* () {
  const db = yield* Db;
  const embedder = yield* Embedder;

  const rrf = (
    table: typeof contratacao | typeof contrato | typeof ata,
    pk: string,
    viewSql: SQL,
    q: string,
    queryVector: number[],
    outerWhere: SQL,
    limit: number
  ) =>
    db.execute(sql`
      with bm as (
        select id, rk from (
          select id, row_number() over () as rk
          from (
            select ${sql.raw(pk)} as id
            from ${table}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(candidates))}
          ) ranked
        ) s
      ),
      vec as (
        select id, row_number() over (order by dist) as rk
        from (
          select ${sql.raw(pk)} as id,
            ${cosineDistance(table.embedding, queryVector)} as dist
          from ${table}
          where embedding is not null
          order by dist
          limit ${sql.raw(String(candidates))}
        ) ranked
      )
      select ${viewSql},
        coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
          + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
      from bm
      full outer join vec on bm.id = vec.id
      join ${table} c on c.${sql.raw(pk)} = coalesce(bm.id, vec.id)
      ${outerWhere}
      order by score desc, c.${sql.raw(pk)}
      limit ${sql.raw(String(limit))}
    `);

  const outerWhereOf = (filters: readonly (SQL | undefined)[]) => {
    const present = filters.filter((value): value is SQL => value !== undefined);
    return Match.value(present.length).pipe(
      Match.when(0, () => sql``),
      Match.orElse(() => sql`where ${sql.join(present, sql` and `)}`)
    );
  };

  const ufFilter = (uf: string | undefined) =>
    Match.value(uf).pipe(
      Match.when(Match.string, (value) =>
        value.trim().length === 0
          ? undefined
          : sql`c.uf_sigla = ${value.trim().toUpperCase()}`
      ),
      Match.orElse(() => undefined)
    );

  const orgaoFilter = (orgaoCnpj: string | undefined) =>
    Match.value(orgaoCnpj).pipe(
      Match.when(Match.string, (value) =>
        onlyDigits(value).length === 0
          ? undefined
          : sql`c.orgao_cnpj = ${onlyDigits(value)}`
      ),
      Match.orElse(() => undefined)
    );

  const municipioFilter = (municipio: string | undefined) =>
    Match.value(municipio).pipe(
      Match.when(Match.string, (value) =>
        value.trim().length === 0 ? undefined : sql`c.codigo_ibge = ${value.trim()}`
      ),
      Match.orElse(() => undefined)
    );

  const modalidadeFilter = (modalidade: number | undefined) =>
    Match.value(modalidade).pipe(
      Match.when(Match.number, (value) => sql`c.modalidade_id = ${value}`),
      Match.orElse(() => undefined)
    );

  const buscarPncp = (input: {
    readonly termo: string;
    readonly tipo?: "contratacao" | "contrato" | "ata" | "todas";
    readonly uf?: string;
    readonly municipio?: string;
    readonly orgaoCnpj?: string;
    readonly modalidade?: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const q = normalize(input.termo);
      const limit = clamp(input.limit, 20, 100);
      const [queryVector] = yield* embedder.embed("query", [input.termo]);

      const rrfContratacao = rrf(
        contratacao,
        "numero_controle_pncp",
        contratacaoView,
        q,
        queryVector,
        outerWhereOf([
          ufFilter(input.uf),
          orgaoFilter(input.orgaoCnpj),
          municipioFilter(input.municipio),
          modalidadeFilter(input.modalidade),
        ]),
        limit
      );

      const rrfContrato = rrf(
        contrato,
        "numero_controle_pncp",
        contratoView,
        q,
        queryVector,
        outerWhereOf([
          ufFilter(input.uf),
          orgaoFilter(input.orgaoCnpj),
          municipioFilter(input.municipio),
        ]),
        limit
      );

      const rrfAta = rrf(
        ata,
        "numero_controle_pncp_ata",
        ataView,
        q,
        queryVector,
        outerWhereOf([
          ufFilter(input.uf),
          Match.value(input.orgaoCnpj).pipe(
            Match.when(Match.string, (value) =>
              onlyDigits(value).length === 0
                ? undefined
                : sql`c.cnpj_orgao = ${onlyDigits(value)}`
            ),
            Match.orElse(() => undefined)
          ),
        ]),
        limit
      );

      const tagged = (
        rows: readonly Record<string, unknown>[],
        tipo: string
      ) => rows.map((row): Record<string, unknown> => ({ ...row, tipo }));

      return yield* Match.value(input.tipo).pipe(
        Match.when("contratacao", () =>
          rrfContratacao.pipe(Effect.map((rows) => tagged(rows, "contratacao")))
        ),
        Match.when("contrato", () =>
          rrfContrato.pipe(Effect.map((rows) => tagged(rows, "contrato")))
        ),
        Match.when("ata", () =>
          rrfAta.pipe(Effect.map((rows) => tagged(rows, "ata")))
        ),
        Match.orElse(() =>
          Effect.all([rrfContratacao, rrfContrato, rrfAta], {
            concurrency: 2,
          }).pipe(
            Effect.map(([contratacoes, contratos, atas]) =>
              [
                ...tagged(contratacoes, "contratacao"),
                ...tagged(contratos, "contrato"),
                ...tagged(atas, "ata"),
              ]
                .sort((a, b) => Number(b.score) - Number(a.score))
                .slice(0, limit)
            )
          )
        )
      );
    });

  const bm25Fornecedores = (q: string, limit: number) =>
    db.execute(sql`
      select ${fornecedorView}, -rk as score
      from (
        select ${fornecedorRankColumns}, row_number() over () as rk
        from (
          select ${fornecedorRankColumns}
          from ${contrato}
          order by busca_fornecedor <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmFornecedores = (q: string, limit: number) =>
    db.execute(sql`
      select ${fornecedorView},
        word_similarity(${q}, busca_fornecedor) as score
      from ${contrato}
      where word_similarity(${q}, busca_fornecedor) >= 0.2
      order by score desc, ni_fornecedor
      limit ${sql.raw(String(limit))}
    `);

  const fornecedorPncpPorNome = (
    nome: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 20, 100);
      return yield* Match.value(q.length).pipe(
        Match.when(0, () =>
          Effect.fail(new PncpError({ code: "pncp.MISSING_FORNECEDOR" }))
        ),
        Match.orElse(() =>
          Effect.gen(function* () {
            const lexical = yield* bm25Fornecedores(q, limit);
            return yield* Match.value(lexical.length).pipe(
              Match.when(0, () => trgmFornecedores(q, limit)),
              Match.orElse(() => Effect.succeed(lexical))
            );
          })
        )
      );
    });

  const contratosDoFornecedor = (input: {
    readonly niFornecedor: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(input.niFornecedor);
      const limit = clamp(input.limit, 50, 500);
      return yield* Match.value(alvo.length).pipe(
        Match.when(0, () =>
          Effect.fail(new PncpError({ code: "pncp.MISSING_NI" }))
        ),
        Match.orElse(() =>
          db.query.contrato
            .findMany({
              where: { niFornecedor: alvo },
              columns: contratoColumns,
              orderBy: (c, { desc }) => desc(c.valorGlobal),
              limit,
            })
            .pipe(
              Effect.map((rows) =>
                rows.map((row): Record<string, unknown> => ({ ...row }))
              )
            )
        )
      );
    });

  const alertasPncp = (options?: {
    readonly uf?: string;
    readonly modalidade?: number;
    readonly dataInicial?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 500);
      const where = {
        ...Match.value(options?.uf).pipe(
          Match.when(Match.string, (value) => ({
            ufSigla: value.trim().toUpperCase(),
          })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options?.modalidade).pipe(
          Match.when(Match.number, (value) => ({ modalidadeId: value })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options?.dataInicial).pipe(
          Match.when(Match.string, (value) => ({
            dataPublicacaoPncp: { gte: value },
          })),
          Match.orElse(() => ({}))
        ),
      };
      return yield* db.query.contratacao.findMany({
        where,
        columns: contratacaoColumns,
        orderBy: (c, { desc }) => desc(c.dataPublicacaoPncp),
        limit,
      });
    });

  const indexScope = (scope: {
    readonly dataInicial: string;
    readonly dataFinal: string;
    readonly modalidades: readonly number[];
  }) =>
    Effect.gen(function* () {
      yield* db.delete(contratacao);
      yield* db.delete(contrato);
      yield* db.delete(ata);
      yield* indexContratacoes(scope);
      yield* indexContratos({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      });
      yield* indexAtas({
        dataInicial: scope.dataInicial,
        dataFinal: scope.dataFinal,
      });
      const contratacoes = yield* db.execute(
        sql`select count(*)::int as count from ${contratacao}`
      );
      const contratos = yield* db.execute(
        sql`select count(*)::int as count from ${contrato}`
      );
      const atas = yield* db.execute(
        sql`select count(*)::int as count from ${ata}`
      );
      return {
        contratacoes: Number(contratacoes[0].count),
        contratos: Number(contratos[0].count),
        atas: Number(atas[0].count),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexScope({
      dataInicial: defaultWindowStart(millis),
      dataFinal: ymd(millis),
      modalidades: [...defaultModalidades],
    })
  );

  return {
    index,
    indexAll: index,
    indexScope,
    buscarPncp,
    fornecedorPncpPorNome,
    contratosDoFornecedor,
    alertasPncp,
  };
});

export class Pncp extends Context.Service<Pncp, Effect.Success<typeof makePncp>>()(
  "dados-publicos-mcp/Pncp"
) {}

export const PncpLive = Layer.effect(Pncp)(makePncp);
