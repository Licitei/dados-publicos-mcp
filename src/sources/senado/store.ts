import { Context, Effect, Layer, Match } from "effect";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { ceapsDespesa } from "../../kernel/db/schemas/ceaps-despesa";
import { senador } from "../../kernel/db/schemas/senador";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultAno } from "./catalog";
import { indexCeapsAno, indexSenadores } from "./indexer";

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    [...tableDdl(senador), ...tableDdl(ceapsDespesa)],
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const ceapsViewColumns = {
  ano: true,
  mes: true,
  senador: true,
  tipoDespesa: true,
  cnpjCpf: true,
  docNormalizado: true,
  fornecedor: true,
  documento: true,
  data: true,
  detalhamento: true,
  valorReembolsado: true,
  codDocumento: true,
} as const;

const ceapsView = sql`
  ano, mes, senador, tipo_despesa as "tipoDespesa", cnpj_cpf as "cnpjCpf",
  doc_normalizado as "docNormalizado", fornecedor, documento, data,
  detalhamento, valor_reembolsado as "valorReembolsado",
  cod_documento as "codDocumento"
`;

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const makeSenado = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;

  const buscarSenador = (nome: string, limit: number) =>
    db.execute(sql`
      select codigo, nome, nome_completo as "nomeCompleto", sexo, partido, uf,
        email, word_similarity(${normalize(nome)}, busca) as score
      from ${senador}
      where word_similarity(${normalize(nome)}, busca) >= 0.2
      order by score desc, nome
      limit ${sql.raw(String(limit))}
    `);

  const bm25Fornecedor = (q: string, limit: number) =>
    db.execute(sql`
      select ${ceapsView}, -rk as score
      from (
        select
          ano, mes, senador, tipo_despesa, cnpj_cpf, doc_normalizado,
          fornecedor, documento, data, detalhamento, valor_reembolsado,
          cod_documento, row_number() over () as rk
        from (
          select
            ano, mes, senador, tipo_despesa, cnpj_cpf, doc_normalizado,
            fornecedor, documento, data, detalhamento, valor_reembolsado,
            cod_documento
          from ${ceapsDespesa}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmFornecedor = (q: string, limit: number) =>
    db.execute(sql`
      select ${ceapsView}, word_similarity(${q}, busca) as score
      from ${ceapsDespesa}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `);

  const buscarFornecedorCeaps = (
    termo: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 50, 200);
      const lexical = yield* bm25Fornecedor(q, limit);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmFornecedor(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const gastosPorFornecedor = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const despesas = yield* db.query.ceapsDespesa.findMany({
        where: { docNormalizado },
        columns: ceapsViewColumns,
        orderBy: (d, { desc }) => desc(d.data),
      });
      const total = despesas.reduce(
        (sum, row) => sum + (row.valorReembolsado ?? 0),
        0
      );
      return {
        documento: documentoInput,
        docNormalizado,
        total,
        count: despesas.length,
        despesas,
      };
    });

  const index = Effect.gen(function* () {
    yield* db.delete(ceapsDespesa);
    yield* db.delete(senador);
    const senadores = yield* indexSenadores;
    const ceaps = yield* indexCeapsAno(defaultAno);
    return { senadores, ceaps };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      yield* db.delete(ceapsDespesa);
      const ceaps = yield* indexCeapsAno(ano);
      return { ceaps };
    });

  return {
    index,
    indexAno,
    buscarSenador: (nome: string, limit?: number) =>
      buscarSenador(nome, clamp(limit, 50, 100)),
    buscarFornecedorCeaps,
    gastosPorFornecedor,
  };
});

export class SenadoFederal extends Context.Service<
  SenadoFederal,
  Effect.Success<typeof makeSenado>
>()("dados-publicos-mcp/SenadoFederal") {}

export const SenadoFederalLive = Layer.effect(SenadoFederal)(makeSenado);
