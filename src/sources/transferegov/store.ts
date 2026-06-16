import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { convenio } from "../../kernel/db/schemas/convenio";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexAll } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    tableDdl(convenio),
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const convenioView = sql`
  nr_convenio as "nrConvenio", id_proposta as "idProposta", situacao,
  data_publicacao as "dataPublicacao", vigencia_inicio as "vigenciaInicio",
  vigencia_fim as "vigenciaFim", valor_global as "valorGlobal",
  valor_repasse as "valorRepasse", cnpj_proponente as "cnpjProponente",
  doc_normalizado as "docNormalizado", nome_proponente as "nomeProponente",
  uf, municipio, cod_municipio_ibge as "codMunicipioIbge",
  orgao_superior as "orgaoSuperior", orgao, objeto, modalidade
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeTransferegov = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const conveniosDoProponente = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const convenios = yield* db.query.convenio.findMany({
        where: { docNormalizado },
        orderBy: (c, { desc }) => desc(c.dataPublicacao),
        limit: 200,
      });
      const total = convenios.reduce(
        (sum, row) => sum + (row.valorRepasse ?? 0),
        0
      );
      return {
        documento: documentoInput,
        docNormalizado,
        count: convenios.length,
        totalRepasse: total,
        convenios,
      };
    });

  const conveniosDoMunicipio = (codIbge: string, limit: number) =>
    db.execute(sql`
      select ${convenioView}
      from ${convenio}
      where cod_municipio_ibge = ${onlyDigits(codIbge)}
      order by valor_global desc nulls last, nr_convenio
      limit ${sql.raw(String(limit))}
    `);

  const bm25Convenio = (q: string, limit: number, ufWhere: SQL) =>
    db.execute(sql`
      select ${convenioView}, score
      from (
        select
          nr_convenio, id_proposta, situacao, data_publicacao,
          vigencia_inicio, vigencia_fim, valor_global, valor_repasse,
          cnpj_proponente, doc_normalizado, nome_proponente, uf, municipio,
          cod_municipio_ibge, orgao_superior, orgao, objeto, modalidade,
          -rk as score
        from (
          select
            nr_convenio, id_proposta, situacao, data_publicacao,
            vigencia_inicio, vigencia_fim, valor_global, valor_repasse,
            cnpj_proponente, doc_normalizado, nome_proponente, uf, municipio,
            cod_municipio_ibge, orgao_superior, orgao, objeto, modalidade,
            row_number() over () as rk
          from (
            select
              nr_convenio, id_proposta, situacao, data_publicacao,
              vigencia_inicio, vigencia_fim, valor_global, valor_repasse,
              cnpj_proponente, doc_normalizado, nome_proponente, uf, municipio,
              cod_municipio_ibge, orgao_superior, orgao, objeto, modalidade
            from ${convenio}
            order by busca <@> to_bm25query(${q})
            limit ${sql.raw(String(limit))}
          ) ranked
        ) numbered
      ) scored
      ${ufWhere}
      order by score desc
    `);

  const buscarConvenio = (
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
      return yield* bm25Convenio(q, limit, ufWhere);
    });

  const index = Effect.gen(function* () {
    yield* db.delete(convenio);
    const inserted = yield* indexAll;
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${convenio}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return {
    index,
    indexAll: index,
    conveniosDoProponente,
    conveniosDoMunicipio,
    buscarConvenio,
  };
});

export class Transferegov extends Context.Service<
  Transferegov,
  Effect.Success<typeof makeTransferegov>
>()("dados-publicos-mcp/Transferegov") {}

export const TransferegovLive = Layer.effect(Transferegov)(makeTransferegov);
