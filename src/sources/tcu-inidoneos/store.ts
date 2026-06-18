import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tcuInidoneo } from "../../kernel/db/schemas/tcu-inidoneo";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { indexAll } from "./indexer";

const viewColumns = {
  lista: true,
  nome: true,
  documento: true,
  docNormalizado: true,
  processo: true,
  deliberacao: true,
  dataTransitoJulgado: true,
  dataFinal: true,
  dataAcordao: true,
  uf: true,
  municipio: true,
} as const;

const inidoneoView = sql`
  lista, nome, documento, doc_normalizado as "docNormalizado",
  processo, deliberacao, data_transito_julgado as "dataTransitoJulgado",
  data_final as "dataFinal", data_acordao as "dataAcordao", uf, municipio
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeTcuInidoneos = Effect.gen(function* () {
  const db = yield* Db;

  const verificar = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const tipoDocumento = Match.value(docNormalizado.length).pipe(
        Match.when(14, () => "cnpj" as const),
        Match.when(11, () => "cpf" as const),
        Match.orElse(() => "desconhecido" as const)
      );
      const registros = yield* db.query.tcuInidoneo.findMany({
        where: { docNormalizado },
        columns: viewColumns,
        orderBy: (r, { desc }) => desc(r.dataTransitoJulgado),
      });
      const porLista = registros.reduce<Record<string, number>>(
        (acc, row) => ({ ...acc, [row.lista]: (acc[row.lista] ?? 0) + 1 }),
        {}
      );
      return {
        documento: documentoInput,
        docNormalizado,
        tipoDocumento,
        inidoneo: registros.length > 0,
        total: registros.length,
        porLista,
        registros,
      };
    });

  const bm25PorNome = (q: string, limit: number) =>
    db.execute(sql`
      select ${inidoneoView}, -rk as score
      from (
        select
          lista, nome, documento, doc_normalizado, processo, deliberacao,
          data_transito_julgado, data_final, data_acordao, uf, municipio,
          row_number() over () as rk
        from (
          select
            lista, nome, documento, doc_normalizado, processo, deliberacao,
            data_transito_julgado, data_final, data_acordao, uf, municipio
          from ${tcuInidoneo}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmPorNome = (q: string, limit: number) =>
    db.execute(sql`
      select ${inidoneoView}, word_similarity(${q}, busca) as score
      from ${tcuInidoneo}
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

  const index = Effect.gen(function* () {
    yield* db.delete(tcuInidoneo);
    const inserted = yield* indexAll;
    const rows = yield* db.execute(
      sql`select count(*)::int as count from ${tcuInidoneo}`
    );
    return { inserted, total: Number(rows[0].count) };
  });

  return { index, indexAll: index, verificar, buscarPorNome };
});

export class TcuInidoneos extends Context.Service<
  TcuInidoneos,
  Effect.Success<typeof makeTcuInidoneos>
>()("dados-publicos-mcp/TcuInidoneos") {}

export const TcuInidoneosLive = Layer.effect(TcuInidoneos)(makeTcuInidoneos);
