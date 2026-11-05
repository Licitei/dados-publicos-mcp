import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
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

const pick = <A, B>(xs: readonly A[], index: number, f: (a: A) => B) =>
  Arr.get(xs, index).pipe(Option.map(f));

const seeded = Effect.gen(function* () {
  const catmat = yield* CatmatCatser;
  yield* catmat.index;
  return catmat;
});

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

    it.effect("buscarMaterial bm25 floats the lexical match to the top", () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const hits = yield* catmat.buscarMaterial("parafuso aco inox");
        expect(pick(hits, 0, (h) => Number(h.codigoItem))).toEqual(Option.some(1003));
        const ranked = yield* catmat.buscarMaterial("computador informatica");
        expect(pick(ranked, 0, (h) => Number(h.codigoItem))).toEqual(Option.some(1001));
        expect(
          Option.zipWith(
            pick(ranked, 0, (h) => Number(h.score)),
            pick(ranked, 1, (h) => Number(h.score)),
            (top, next) => top > next
          )
        ).toEqual(Option.some(true));
        const limited = yield* catmat.buscarMaterial("computador", { limit: 1 });
        expect(limited).toHaveLength(1);
        const todos = yield* catmat.buscarMaterial("cadeira ergonomica");
        expect(Arr.map(todos, (h) => Number(h.codigoItem))).toContain(1004);
        const ativos = yield* catmat.buscarMaterial("cadeira ergonomica", {
          apenasAtivos: true,
        });
        expect(Arr.map(ativos, (h) => Number(h.codigoItem))).not.toContain(1004);
      })
    );

    it.effect("buscarServico ranks bm25 lexical hits and falls back to fuzzy on typos", () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const lexical = yield* catmat.buscarServico("manutencao computadores");
        expect(pick(lexical, 0, (r) => Number(r.codigoServico))).toEqual(Option.some(5002));
        const typo = yield* catmat.buscarServico("limpza");
        expect(Arr.map(typo, (r) => Number(r.codigoServico))).toContain(5001);
        expect(pick(typo, 0, (r) => r.score)).toEqual(Option.some(0));
        const none = yield* catmat.buscarServico("zzzzz inexistente xpto");
        expect(none).toHaveLength(0);
      })
    );

    it.effect("resolver returns the denormalized chain or fails NOT_FOUND", () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const item = yield* catmat.resolver(1003);
        expect(item.material?.nomeGrupo).toBe("Material de Construcao");
        expect(item.servico).toBeNull();
        const svc = yield* catmat.resolver(5001, "servico");
        expect(svc.servico?.nomeServico).toContain("limpeza");
        expect(svc.material).toBeNull();
        const error = yield* Effect.flip(catmat.resolver(999999));
        expect(error._tag).toBe("CatmatCatserError");
        expect(error.message).toContain("nao encontrado");
      })
    );

    it.effect("normalizarItemEdital fans out into materials + services", () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const out = yield* catmat.normalizarItemEdital("manutencao de computadores e parafusos");
        expect(Arr.map(out.materiais, (m) => Number(m.codigoItem))).toContain(1003);
        expect(Arr.map(out.servicos, (s) => Number(s.codigoServico))).toContain(5002);
        expect(Arr.head(out.materiais)).toEqual(
          Option.some(expect.objectContaining({ nomeGrupo: expect.any(String) }))
        );
      })
    );

    it.effect("listByLevel filters by a denormalized hierarchy code", () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const grupo = yield* catmat.listByLevel({
          tipo: "material",
          nivel: "grupo",
          codigo: 70,
        });
        expect(grupo.total).toBe(2);
        expect(
          Arr.sort(
            Arr.map(grupo.itens, (i) => i.codigo),
            Order.Number
          )
        ).toEqual([1001, 1002]);
        const svcGrupo = yield* catmat.listByLevel({
          tipo: "servico",
          nivel: "grupo",
          codigo: 100,
        });
        expect(
          Arr.sort(
            Arr.map(svcGrupo.itens, (i) => i.codigo),
            Order.Number
          )
        ).toEqual([5001, 5002]);
        const svcClasse = yield* catmat.listByLevel({
          tipo: "servico",
          nivel: "classe",
          codigo: 1000,
        });
        expect(Arr.map(svcClasse.itens, (i) => i.codigo)).toEqual([5001]);
        const error = yield* Effect.flip(
          catmat.listByLevel({ tipo: "material", nivel: "xyz", codigo: 70 })
        );
        expect(error._tag).toBe("CatmatCatserError");
        expect(error.message).toContain("Nivel");
      })
    );
  }
);
