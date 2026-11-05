import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Option from "effect/Option";
import { Duck } from "../../src/kernel/duck/duck";
import { catmatMaterialTable, catserServiceTable } from "../../src/sources/catmat-catser/catalog";
import { CatmatCatser, CatmatCatserLive } from "../../src/sources/catmat-catser/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const material = (
  codigoItem: number,
  codigoGrupo: number,
  nomeGrupo: string,
  codigoClasse: number,
  nomeClasse: string,
  codigoPdm: number,
  nomePdm: string,
  descricaoItem: string,
  statusItem = true
) => ({
  codigoItem,
  codigoGrupo,
  nomeGrupo,
  codigoClasse,
  nomeClasse,
  codigoPdm,
  nomePdm,
  descricaoItem,
  codigo_ncm: "84713012",
  descricao_ncm: "Maquinas",
  statusItem,
});

const servico = (
  codigoServico: number,
  nomeServico: string,
  codigoClasse: number,
  nomeClasse: string,
  codigoSubclasse: number,
  nomeSubclasse: string
) => ({
  codigoServico,
  nomeServico,
  codigoSecao: 1,
  nomeSecao: "Secao",
  codigoDivisao: 10,
  nomeDivisao: "Divisao",
  codigoGrupo: 100,
  nomeGrupo: "Grupo",
  codigoClasse,
  nomeClasse,
  codigoSubclasse,
  nomeSubclasse,
  statusServico: true,
});

const materiais = [
  material(
    1001,
    70,
    "Equipamentos de Informatica",
    7010,
    "Microcomputadores",
    11,
    "Computador",
    "Computador desktop processador core i7 16gb memoria"
  ),
  material(
    1002,
    70,
    "Equipamentos de Informatica",
    7010,
    "Microcomputadores",
    12,
    "Notebook",
    "Notebook ultrafino tela 14 polegadas 8gb"
  ),
  material(
    1003,
    31,
    "Material de Construcao",
    3110,
    "Fixadores",
    13,
    "Parafuso",
    "Parafuso de aco inox sextavado rosca m6"
  ),
  material(
    1004,
    99,
    "Mobiliario Descontinuado",
    9910,
    "Cadeiras",
    14,
    "Cadeira",
    "Cadeira de escritorio ergonomica giratoria",
    false
  ),
];

const servicos = [
  servico(5001, "Servico de limpeza predial e conservacao", 1000, "Limpeza", 10001, "Predial"),
  servico(5002, "Manutencao de computadores e notebooks", 2000, "Suporte", 20001, "Tecnico"),
];

const toJson = (value: unknown) =>
  Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(value).pipe(
    Option.getOrElse(() => "")
  );

const pageOf = (rows: readonly unknown[]) => toJson({ resultado: rows, totalPaginas: 1 });

const firstPage = (url: URL) => url.searchParams.get("pagina") === "1";

const HttpFixture = fixtureLayer([
  {
    match: (url) => pathIncludes("modulo-material")(url) && firstPage(url),
    respond: { body: pageOf(materiais) },
  },
  {
    match: (url) => pathIncludes("modulo-servico")(url) && firstPage(url),
    respond: { body: pageOf(servicos) },
  },
  {
    match: pathIncludes("modulo-"),
    respond: { body: pageOf([]) },
  },
]);

const Infra = Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture);

const TestLayer = CatmatCatserLive.pipe(Layer.provideMerge(Infra));

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "catmat-catser store + pagination + DuckDB bm25 + fuzzy search",
  (it) => {
    it.effect("index streams material + service pages and counts both tables", () =>
      Effect.gen(function* () {
        const catmat = yield* CatmatCatser;
        const total = yield* catmat.index;
        expect(total).toEqual({ materiais: 4, servicos: 2 });
        const duck = yield* Duck;
        const materiais = yield* duck.count(catmatMaterialTable);
        const servicos = yield* duck.count(catserServiceTable);
        expect(materiais).toBe(4);
        expect(servicos).toBe(2);
      })
    );
  }
);
