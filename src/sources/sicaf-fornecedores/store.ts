import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { fornecedor } from "../../kernel/db/schemas/fornecedor";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexFornecedores } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(fornecedor),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const viewColumns = {
  cnpj: true,
  cpf: true,
  nomeRazaoSocial: true,
  ativo: true,
  habilitadoLicitar: true,
  ufSigla: true,
  nomeMunicipio: true,
  codigoCnae: true,
  nomeCnae: true,
  naturezaJuridicaNome: true,
  porteEmpresaNome: true,
} as const;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeSicaf = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const buscar = (options: {
    readonly nome: string;
    readonly apenasAtivos?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const q = normalize(options.nome);
      const limit = clamp(options.limit, 20, 100);
      const ativoFilter = Match.value(options.apenasAtivos).pipe(
        Match.when(true, () => sql`where ativo = true`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select
          cnpj, cpf, nome_razao_social as "nomeRazaoSocial", ativo,
          habilitado_licitar as "habilitadoLicitar", uf_sigla as "ufSigla",
          nome_municipio as "nomeMunicipio", codigo_cnae as "codigoCnae",
          nome_cnae as "nomeCnae",
          natureza_juridica_nome as "naturezaJuridicaNome",
          porte_empresa_nome as "porteEmpresaNome", -rk as score
        from (
          select *, row_number() over () as rk
          from (
            select * from ${fornecedor}
            ${ativoFilter}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) scored
        order by rk
      `);
    });

  const habilitado = (cnpjInput: string) =>
    Effect.gen(function* () {
      const cnpj = onlyDigits(cnpjInput);
      const row = yield* db.query.fornecedor.findFirst({
        where: { cnpj },
        columns: viewColumns,
      });
      return yield* Match.value(row).pipe(
        Match.when(Match.undefined, () =>
          Effect.succeed({
            cnpj,
            encontrado: false,
            ativo: false,
            habilitadoLicitar: false,
            fornecedor: null,
          })
        ),
        Match.orElse((found) =>
          Effect.succeed({
            cnpj,
            encontrado: true,
            ativo: found.ativo,
            habilitadoLicitar: found.habilitadoLicitar,
            fornecedor: found,
          })
        )
      );
    });

  const listar = (options: {
    readonly uf?: string;
    readonly municipio?: string;
    readonly cnae?: number;
    readonly apenasAtivos?: boolean;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 50, 500);
      const where = {
        ...Match.value(options.uf).pipe(
          Match.when(Match.string, (uf) => ({ ufSigla: uf.trim().toUpperCase() })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options.cnae).pipe(
          Match.when(Match.number, (cnae) => ({ codigoCnae: cnae })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options.municipio).pipe(
          Match.when(Match.string, (municipio) => ({
            nomeMunicipioNormalizado: { like: `%${normalize(municipio)}%` },
          })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options.apenasAtivos).pipe(
          Match.when(true, () => ({ ativo: true })),
          Match.orElse(() => ({}))
        ),
      };
      return yield* db.query.fornecedor.findMany({
        where,
        columns: viewColumns,
        orderBy: (f, { asc }) => asc(f.nomeRazaoSocial),
        limit,
      });
    });

  const index = Effect.gen(function* () {
    yield* db.delete(fornecedor);
    yield* indexFornecedores;
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${fornecedor}`
    );
    return Number(rows[0].count);
  });

  return { index, indexAll: index, buscar, habilitado, listar };
});

export class Sicaf extends Context.Service<
  Sicaf,
  Effect.Success<typeof makeSicaf>
>()("dados-publicos-mcp/Sicaf") {}

export const SicafLive = Layer.effect(Sicaf)(makeSicaf);
