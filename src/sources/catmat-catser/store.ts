import { Context, Effect, Layer, Match } from "effect";
import { cosineDistance, sql, type SQL } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { tableDdl } from "../../kernel/db/ddl";
import { catmatMaterial } from "../../kernel/db/schemas/catmat-material";
import { catserService } from "../../kernel/db/schemas/catser-service";
import { Embedder } from "../../kernel/embed/embedder";
import { normalize } from "../../kernel/text/normalize";
import { CatmatCatserError } from "./catalog";
import { indexMateriais, indexServicos } from "./indexer";

const rrfK = 60;
const candidates = 50;

export const createSchema = Effect.gen(function* () {
  const db = yield* Db;
  yield* Effect.forEach(
    [...tableDdl(catmatMaterial), ...tableDdl(catserService)],
    (statement) => db.execute(statement),
    { discard: true }
  );
});

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const materialColumns = {
  codigoItem: true,
  descricaoItem: true,
  codigoPdm: true,
  nomePdm: true,
  codigoClasse: true,
  nomeClasse: true,
  codigoGrupo: true,
  nomeGrupo: true,
  statusItem: true,
} as const;

const servicoColumns = {
  codigoServico: true,
  nomeServico: true,
  codigoSubclasse: true,
  nomeSubclasse: true,
  codigoClasse: true,
  nomeClasse: true,
  codigoGrupo: true,
  nomeGrupo: true,
  codigoDivisao: true,
  nomeDivisao: true,
  codigoSecao: true,
  nomeSecao: true,
  statusServico: true,
} as const;

type Leaf = { readonly codigo: number; readonly descricao: string | null };

const mapMaterialLeaf = (
  rows: readonly { readonly codigoItem: number; readonly descricaoItem: string | null }[]
): readonly Leaf[] =>
  rows.map((r) => ({ codigo: r.codigoItem, descricao: r.descricaoItem }));

const mapServicoLeaf = (
  rows: readonly { readonly codigoServico: number; readonly nomeServico: string | null }[]
): readonly Leaf[] =>
  rows.map((r) => ({ codigo: r.codigoServico, descricao: r.nomeServico }));

const materialLeafColumns = { codigoItem: true, descricaoItem: true } as const;
const servicoLeafColumns = { codigoServico: true, nomeServico: true } as const;

const makeCatmatCatser = Effect.gen(function* () {
  yield* createSchema;
  const db = yield* Db;
  const embedder = yield* Embedder;

  const buscarMaterial = (
    termo: string,
    options?: { readonly limit?: number; readonly apenasAtivos?: boolean }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 10, 50);
      const [queryVector] = yield* embedder.embed("query", [termo]);
      const ativoWhere = Match.value(options?.apenasAtivos).pipe(
        Match.when(true, () => sql`where status_item`),
        Match.orElse(() => sql``)
      );
      const ativoAnd = Match.value(options?.apenasAtivos).pipe(
        Match.when(true, () => sql`and status_item`),
        Match.orElse(() => sql``)
      );
      return yield* db.execute(sql`
        with bm as (
          select codigo_item, rk from (
            select codigo_item, row_number() over () as rk
            from (
              select codigo_item
              from ${catmatMaterial}
              ${ativoWhere}
              order by busca <@> to_bm25query(${q})
              limit ${sql.raw(String(candidates))}
            ) ranked
          ) s
        ),
        vec as (
          select codigo_item, row_number() over (order by dist) as rk
          from (
            select codigo_item,
              ${cosineDistance(catmatMaterial.embedding, queryVector)} as dist
            from ${catmatMaterial}
            where embedding is not null ${ativoAnd}
            order by dist
            limit ${sql.raw(String(candidates))}
          ) ranked
        )
        select
          m.codigo_item as "codigoItem",
          m.descricao_item as "descricaoItem",
          m.codigo_pdm as "codigoPdm", m.nome_pdm as "nomePdm",
          m.codigo_classe as "codigoClasse", m.nome_classe as "nomeClasse",
          m.codigo_grupo as "codigoGrupo", m.nome_grupo as "nomeGrupo",
          m.status_item as "statusItem",
          coalesce(1.0 / (${sql.raw(String(rrfK))} + bm.rk), 0)
            + coalesce(1.0 / (${sql.raw(String(rrfK))} + vec.rk), 0) as score
        from bm
        full outer join vec on bm.codigo_item = vec.codigo_item
        join ${catmatMaterial} m
          on m.codigo_item = coalesce(bm.codigo_item, vec.codigo_item)
        order by score desc, m.codigo_item
        limit ${sql.raw(String(limit))}
      `);
    });

  const bm25Servicos = (q: string, limit: number, ativoWhere: SQL) =>
    db.execute(sql`
      select
        codigo_servico as "codigoServico", nome_servico as "nomeServico",
        codigo_subclasse as "codigoSubclasse", nome_subclasse as "nomeSubclasse",
        codigo_classe as "codigoClasse", nome_classe as "nomeClasse",
        status_servico as "statusServico", -rk as score
      from (
        select
          codigo_servico, nome_servico, codigo_subclasse, nome_subclasse,
          codigo_classe, nome_classe, status_servico,
          row_number() over () as rk
        from (
          select
            codigo_servico, nome_servico, codigo_subclasse, nome_subclasse,
            codigo_classe, nome_classe, status_servico
          from ${catserService}
          ${ativoWhere}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `);

  const trgmServicos = (q: string, limit: number, ativoAnd: SQL) =>
    db.execute(sql`
      select
        codigo_servico as "codigoServico", nome_servico as "nomeServico",
        codigo_subclasse as "codigoSubclasse", nome_subclasse as "nomeSubclasse",
        codigo_classe as "codigoClasse", nome_classe as "nomeClasse",
        status_servico as "statusServico",
        word_similarity(${q}, busca) as score
      from ${catserService}
      where word_similarity(${q}, busca) >= 0.2 ${ativoAnd}
      order by score desc, codigo_servico
      limit ${sql.raw(String(limit))}
    `);

  const buscarServico = (
    termo: string,
    options?: { readonly limit?: number; readonly apenasAtivos?: boolean }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 10, 50);
      const ativoWhere = Match.value(options?.apenasAtivos).pipe(
        Match.when(true, () => sql`where status_servico`),
        Match.orElse(() => sql``)
      );
      const ativoAnd = Match.value(options?.apenasAtivos).pipe(
        Match.when(true, () => sql`and status_servico`),
        Match.orElse(() => sql``)
      );
      const lexical = yield* bm25Servicos(q, limit, ativoWhere);
      return yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmServicos(q, limit, ativoAnd)),
        Match.orElse(() => Effect.succeed(lexical))
      );
    });

  const resolver = (codigo: number, tipo?: "material" | "servico") =>
    Effect.gen(function* () {
      const matRow = yield* db.query.catmatMaterial.findFirst({
        where: { codigoItem: codigo },
        columns: materialColumns,
      });
      const svcRow = yield* db.query.catserService.findFirst({
        where: { codigoServico: codigo },
        columns: servicoColumns,
      });
      const material = tipo === "servico" ? null : (matRow ?? null);
      const servico = tipo === "material" ? null : (svcRow ?? null);
      return material === null && servico === null
        ? yield* Effect.fail(
            new CatmatCatserError({
              code: "catmat.NOT_FOUND",
              codigo: String(codigo),
            })
          )
        : { material, servico };
    });

  const normalizarItemEdital = (
    descricao: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.all(
      {
        materiais: buscarMaterial(descricao, options),
        servicos: buscarServico(descricao, options),
      },
      { concurrency: 2 }
    );

  const listMaterialLevel = (nivel: string, codigo: number, limit: number) =>
    Match.value(nivel).pipe(
      Match.when("grupo", () =>
        db.query.catmatMaterial
          .findMany({
            where: { codigoGrupo: codigo },
            columns: materialLeafColumns,
            orderBy: (m, { asc }) => asc(m.codigoItem),
            limit,
          })
          .pipe(Effect.map(mapMaterialLeaf))
      ),
      Match.when("classe", () =>
        db.query.catmatMaterial
          .findMany({
            where: { codigoClasse: codigo },
            columns: materialLeafColumns,
            orderBy: (m, { asc }) => asc(m.codigoItem),
            limit,
          })
          .pipe(Effect.map(mapMaterialLeaf))
      ),
      Match.when("pdm", () =>
        db.query.catmatMaterial
          .findMany({
            where: { codigoPdm: codigo },
            columns: materialLeafColumns,
            orderBy: (m, { asc }) => asc(m.codigoItem),
            limit,
          })
          .pipe(Effect.map(mapMaterialLeaf))
      ),
      Match.orElse(() =>
        Effect.fail(
          new CatmatCatserError({ code: "catmat.LEVEL_UNRECOGNIZED", nivel })
        )
      )
    );

  const listServicoLevel = (nivel: string, codigo: number, limit: number) =>
    Match.value(nivel).pipe(
      Match.when("secao", () =>
        db.query.catserService
          .findMany({
            where: { codigoSecao: codigo },
            columns: servicoLeafColumns,
            orderBy: (s, { asc }) => asc(s.codigoServico),
            limit,
          })
          .pipe(Effect.map(mapServicoLeaf))
      ),
      Match.when("divisao", () =>
        db.query.catserService
          .findMany({
            where: { codigoDivisao: codigo },
            columns: servicoLeafColumns,
            orderBy: (s, { asc }) => asc(s.codigoServico),
            limit,
          })
          .pipe(Effect.map(mapServicoLeaf))
      ),
      Match.when("grupo", () =>
        db.query.catserService
          .findMany({
            where: { codigoGrupo: codigo },
            columns: servicoLeafColumns,
            orderBy: (s, { asc }) => asc(s.codigoServico),
            limit,
          })
          .pipe(Effect.map(mapServicoLeaf))
      ),
      Match.when("classe", () =>
        db.query.catserService
          .findMany({
            where: { codigoClasse: codigo },
            columns: servicoLeafColumns,
            orderBy: (s, { asc }) => asc(s.codigoServico),
            limit,
          })
          .pipe(Effect.map(mapServicoLeaf))
      ),
      Match.when("subclasse", () =>
        db.query.catserService
          .findMany({
            where: { codigoSubclasse: codigo },
            columns: servicoLeafColumns,
            orderBy: (s, { asc }) => asc(s.codigoServico),
            limit,
          })
          .pipe(Effect.map(mapServicoLeaf))
      ),
      Match.orElse(() =>
        Effect.fail(
          new CatmatCatserError({ code: "catmat.LEVEL_UNRECOGNIZED", nivel })
        )
      )
    );

  const listByLevel = (options: {
    readonly tipo: "material" | "servico";
    readonly nivel: string;
    readonly codigo: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 50, 500);
      const itens = yield* Match.value(options.tipo).pipe(
        Match.when("material", () =>
          listMaterialLevel(options.nivel, options.codigo, limit)
        ),
        Match.when("servico", () =>
          listServicoLevel(options.nivel, options.codigo, limit)
        ),
        Match.exhaustive
      );
      return {
        tipo: options.tipo,
        nivel: options.nivel,
        codigo: options.codigo,
        total: itens.length,
        itens,
      };
    });

  const index = Effect.gen(function* () {
    yield* db.delete(catserService);
    yield* db.delete(catmatMaterial);
    yield* indexServicos;
    yield* indexMateriais;
    const materiais = yield* db.execute(
      sql`select count(*)::int as count from ${catmatMaterial}`
    );
    const servicos = yield* db.execute(
      sql`select count(*)::int as count from ${catserService}`
    );
    return {
      materiais: Number(materiais[0].count),
      servicos: Number(servicos[0].count),
    };
  });

  return {
    index,
    indexAll: index,
    buscarMaterial,
    buscarServico,
    resolver,
    normalizarItemEdital,
    listByLevel,
  };
});

export class CatmatCatser extends Context.Service<
  CatmatCatser,
  Effect.Success<typeof makeCatmatCatser>
>()("dados-publicos-mcp/CatmatCatser") {}

export const CatmatCatserLive = Layer.effect(CatmatCatser)(makeCatmatCatser);
