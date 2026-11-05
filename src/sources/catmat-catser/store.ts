import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { Context, Effect, Layer, Match, Option, Schema, Struct } from "effect";
import { Duck, idsParam } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize } from "../../kernel/text/normalize";
import { catmatMaterialTable, CatmatCatserError, catserServiceTable } from "./catalog";
import { indexMateriais, indexServicos } from "./indexer";
import { clamp, lexicalOrFuzzy, scoredFrom } from "../../kernel/duck/search";

const NullableString = Schema.NullOr(Schema.String);
const NullableNumber = Schema.NullOr(Schema.Finite);

const MaterialRow = Schema.Struct({
  codigoItem: Schema.Finite,
  descricaoItem: NullableString,
  codigoPdm: NullableNumber,
  nomePdm: NullableString,
  codigoClasse: NullableNumber,
  nomeClasse: NullableString,
  codigoGrupo: NullableNumber,
  nomeGrupo: NullableString,
  statusItem: Schema.Boolean,
});

const MaterialHit = Schema.Struct({ ...MaterialRow.fields, score: Schema.Finite });

const ServicoRow = Schema.Struct({
  codigoServico: Schema.Finite,
  nomeServico: NullableString,
  codigoSubclasse: NullableNumber,
  nomeSubclasse: NullableString,
  codigoClasse: NullableNumber,
  nomeClasse: NullableString,
  codigoGrupo: NullableNumber,
  nomeGrupo: NullableString,
  codigoDivisao: NullableNumber,
  nomeDivisao: NullableString,
  codigoSecao: NullableNumber,
  nomeSecao: NullableString,
  statusServico: Schema.Boolean,
});

const ServicoHit = Schema.Struct({
  ...ServicoRow.mapFields(
    Struct.pick([
      "codigoServico",
      "nomeServico",
      "codigoSubclasse",
      "nomeSubclasse",
      "codigoClasse",
      "nomeClasse",
      "statusServico",
    ])
  ).fields,
  score: Schema.Finite,
});

const Leaf = Schema.Struct({ codigo: Schema.Finite, descricao: NullableString });

const ServicoCorpus = Schema.Struct({ codigoServico: Schema.Finite, busca: Schema.String });

const materialColumns = `"codigoItem", "descricaoItem", "codigoPdm", "nomePdm", "codigoClasse", "nomeClasse", "codigoGrupo", "nomeGrupo", "statusItem"`;

const servicoColumns = `"codigoServico", "nomeServico", "codigoSubclasse", "nomeSubclasse", "codigoClasse", "nomeClasse", "codigoGrupo", "nomeGrupo", "codigoDivisao", "nomeDivisao", "codigoSecao", "nomeSecao", "statusServico"`;

const servicoHitColumns = `"codigoServico", "nomeServico", "codigoSubclasse", "nomeSubclasse", "codigoClasse", "nomeClasse", "statusServico"`;

const idsInteger = `IN (SELECT unnest(string_split(?, chr(31)))::INTEGER)`;

const materialLevelColumn = (nivel: string) =>
  Match.value(nivel).pipe(
    Match.when("grupo", () => Option.some("codigoGrupo")),
    Match.when("classe", () => Option.some("codigoClasse")),
    Match.when("pdm", () => Option.some("codigoPdm")),
    Match.orElse(() => Option.none<string>())
  );

const servicoLevelColumn = (nivel: string) =>
  Match.value(nivel).pipe(
    Match.when("secao", () => Option.some("codigoSecao")),
    Match.when("divisao", () => Option.some("codigoDivisao")),
    Match.when("grupo", () => Option.some("codigoGrupo")),
    Match.when("classe", () => Option.some("codigoClasse")),
    Match.when("subclasse", () => Option.some("codigoSubclasse")),
    Match.orElse(() => Option.none<string>())
  );

const SearchOptions = Schema.Struct({
  limit: Schema.optional(Schema.Finite),
  apenasAtivos: Schema.optional(Schema.Boolean),
});
type SearchOptions = (typeof SearchOptions)["Type"];

const searchTerms = (termo: string, options: SearchOptions | undefined, statusColumn: string) => ({
  q: normalize(termo),
  limit: clamp(options?.limit, 10, 50),
  ativoAnd: options?.apenasAtivos === true ? ` AND "${statusColumn}"` : "",
});

const makeCatmatCatser = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const buscarMaterial = (termo: string, options?: SearchOptions) =>
    Effect.gen(function* () {
      const { q, limit, ativoAnd } = searchTerms(termo, options, "statusItem");
      return q === ""
        ? []
        : yield* duck.query(
            MaterialHit,
            `SELECT ${materialColumns}, score ${scoredFrom(catmatMaterialTable)}${ativoAnd}
             ORDER BY score DESC, "codigoItem" LIMIT ?`,
            [q, limit]
          );
    });

  const buscarServico = (termo: string, options?: SearchOptions) =>
    Effect.gen(function* () {
      const { q, limit, ativoAnd } = searchTerms(termo, options, "statusServico");
      return yield* q === ""
        ? Effect.succeed([])
        : lexicalOrFuzzy(
            duck.query(
              ServicoHit,
              `SELECT ${servicoHitColumns}, score ${scoredFrom(catserServiceTable)}${ativoAnd}
               ORDER BY score DESC, "codigoServico" LIMIT ?`,
              [q, limit]
            ),
            fuzzy.match("catser_service", q, { limit }),
            (ids) =>
              duck.query(
                ServicoHit,
                `SELECT ${servicoHitColumns}, 0::DOUBLE AS score FROM catser_service
                 WHERE "codigoServico" ${idsInteger}${ativoAnd}`,
                [idsParam(ids)]
              ),
            (row) => row.codigoServico
          );
    });

  const resolver = (codigo: number, tipo?: "material" | "servico") =>
    Effect.gen(function* () {
      const matRows = yield* duck.query(
        MaterialRow,
        `SELECT ${materialColumns} FROM catmat_material WHERE "codigoItem" = ?`,
        [codigo]
      );
      const svcRows = yield* duck.query(
        ServicoRow,
        `SELECT ${servicoColumns} FROM catser_service WHERE "codigoServico" = ?`,
        [codigo]
      );
      const material = tipo === "servico" ? null : Option.getOrNull(Arr.head(matRows));
      const servico = tipo === "material" ? null : Option.getOrNull(Arr.head(svcRows));
      return material === null && servico === null
        ? yield* CatmatCatserError.make({
            code: "catmat.NOT_FOUND",
            codigo: String(codigo),
          })
        : { material, servico };
    });

  const normalizarItemEdital = (descricao: string, options?: { readonly limit?: number }) =>
    Effect.all(
      {
        materiais: buscarMaterial(descricao, options),
        servicos: buscarServico(descricao, options),
      },
      { concurrency: 2 }
    );

  const leaves = (
    table: string,
    codigoColumn: string,
    descricaoColumn: string,
    column: string,
    codigo: number,
    limit: number
  ) =>
    duck.query(
      Leaf,
      `SELECT "${codigoColumn}" AS codigo, "${descricaoColumn}" AS descricao FROM ${table}
       WHERE "${column}" = ? ORDER BY "${codigoColumn}" LIMIT ?`,
      [codigo, limit]
    );

  const listMaterialLevel = (nivel: string, codigo: number, limit: number) =>
    Option.match(materialLevelColumn(nivel), {
      onNone: () =>
        Effect.fail(CatmatCatserError.make({ code: "catmat.LEVEL_UNRECOGNIZED", nivel })),
      onSome: (column) =>
        leaves("catmat_material", "codigoItem", "descricaoItem", column, codigo, limit),
    });

  const listServicoLevel = (nivel: string, codigo: number, limit: number) =>
    Option.match(servicoLevelColumn(nivel), {
      onNone: () =>
        Effect.fail(CatmatCatserError.make({ code: "catmat.LEVEL_UNRECOGNIZED", nivel })),
      onSome: (column) =>
        leaves("catser_service", "codigoServico", "nomeServico", column, codigo, limit),
    });

  const listByLevel = (options: {
    readonly tipo: "material" | "servico";
    readonly nivel: string;
    readonly codigo: number;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 50, 500);
      const itens = yield* Match.value(options.tipo).pipe(
        Match.when("material", () => listMaterialLevel(options.nivel, options.codigo, limit)),
        Match.when("servico", () => listServicoLevel(options.nivel, options.codigo, limit)),
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
    yield* duck.create(catserServiceTable);
    yield* duck.create(catmatMaterialTable);
    yield* indexServicos;
    yield* indexMateriais;
    yield* duck.reindex(catmatMaterialTable);
    yield* duck.reindex(catserServiceTable);
    const corpus = yield* duck.query(
      ServicoCorpus,
      `SELECT "codigoServico", busca FROM catser_service`
    );
    yield* fuzzy.write(
      "catser_service",
      pipe(
        corpus,
        Arr.map((row): readonly [number, string] => [row.codigoServico, row.busca])
      )
    );
    return {
      materiais: yield* duck.count(catmatMaterialTable),
      servicos: yield* duck.count(catserServiceTable),
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
>()("dados-publicos-mcp/sources/catmat-catser/store/CatmatCatser") {}

export const CatmatCatserLive = Layer.effect(CatmatCatser)(makeCatmatCatser);
