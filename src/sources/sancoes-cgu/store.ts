import { Context, Effect, Layer, Match } from "effect";
import { sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { sancao } from "../../kernel/db/schemas/sancao";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexSnapshots } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(tableDdl(sancao), (statement) => db.execute(statement), {
    discard: true,
  });
});

const viewColumns = {
  lista: true,
  codigo: true,
  tipoPessoa: true,
  documento: true,
  docNormalizado: true,
  nome: true,
  razaoSocial: true,
  categoria: true,
  numeroProcesso: true,
  valorMulta: true,
  dataInicio: true,
  dataFinal: true,
  dataPublicacao: true,
  orgaoSancionador: true,
  ufOrgao: true,
  fundamentacao: true,
} as const;

const sancaoView = sql`
  lista, codigo, tipo_pessoa as "tipoPessoa", documento,
  doc_normalizado as "docNormalizado", nome, razao_social as "razaoSocial",
  categoria, numero_processo as "numeroProcesso", valor_multa as "valorMulta",
  data_inicio as "dataInicio", data_final as "dataFinal",
  data_publicacao as "dataPublicacao",
  orgao_sancionador as "orgaoSancionador", uf_orgao as "ufOrgao",
  fundamentacao
`;

const impeditivas = new Set(["ceis", "cnep", "cepim"]);

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeSancoesCgu = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const verificar = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const tipoDocumento = Match.value(docNormalizado.length).pipe(
        Match.when(14, () => "cnpj" as const),
        Match.when(11, () => "cpf" as const),
        Match.orElse(() => "desconhecido" as const)
      );
      const sancoes = yield* db.query.sancao.findMany({
        where: { docNormalizado },
        columns: viewColumns,
        orderBy: (s, { desc }) => desc(s.dataInicio),
      });
      const porLista = sancoes.reduce<Record<string, number>>(
        (acc, row) => ({ ...acc, [row.lista]: (acc[row.lista] ?? 0) + 1 }),
        {}
      );
      return {
        documento: documentoInput,
        docNormalizado,
        tipoDocumento,
        sancionado: sancoes.length > 0,
        inidoneoOuImpedido: sancoes.some((row) => impeditivas.has(row.lista)),
        total: sancoes.length,
        porLista,
        sancoes,
      };
    });

  const bm25PorNome = (q: string, limit: number) =>
    db.execute(sql`
      select ${sancaoView}, -rk as score
      from (
        select
          lista, codigo, tipo_pessoa, documento, doc_normalizado, nome,
          razao_social, categoria, numero_processo, valor_multa, data_inicio,
          data_final, data_publicacao, orgao_sancionador, uf_orgao,
          fundamentacao, row_number() over () as rk
        from (
          select
            lista, codigo, tipo_pessoa, documento, doc_normalizado, nome,
            razao_social, categoria, numero_processo, valor_multa, data_inicio,
            data_final, data_publicacao, orgao_sancionador, uf_orgao,
            fundamentacao
          from ${sancao}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmPorNome = (q: string, limit: number) =>
    db.execute(sql`
      select ${sancaoView}, word_similarity(${q}, busca) as score
      from ${sancao}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `);

  const buscarPorNome = (
    nome: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 50, 100);
      const lexical = yield* bm25PorNome(q, limit);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmPorNome(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const vigentesNaData = (
    data: string,
    options?: { readonly lista?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const iso = data.trim();
      const limit = clamp(options?.limit, 200, 500);
      const listaWhere: SQL = Match.value(options?.lista).pipe(
        Match.when(Match.string, (lista) => sql`and lista = ${lista}`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        select ${sancaoView}, data_inicio as score
        from ${sancao}
        where data_inicio is not null
          and data_inicio <= ${iso}
          and (data_final is null or data_final = '' or data_final >= ${iso})
          ${listaWhere}
        order by data_inicio desc
        limit ${sql.raw(String(limit))}
      `);
    });

  const index = Effect.gen(function* () {
    yield* db.delete(sancao);
    const inserted = yield* indexSnapshots;
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${sancao}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return { index, indexAll: index, verificar, buscarPorNome, vigentesNaData };
});

export class SancoesCgu extends Context.Service<
  SancoesCgu,
  Effect.Success<typeof makeSancoesCgu>
>()("dados-publicos-mcp/SancoesCgu") {}

export const SancoesCguLive = Layer.effect(SancoesCgu)(makeSancoesCgu);
