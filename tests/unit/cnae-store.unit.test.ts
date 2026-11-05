import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { Duck } from "../../src/kernel/duck/duck";
import { Cnae, CnaeLive, cnaeTable } from "../../src/sources/cnae/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const secaoJ = { id: "J", descricao: "Informacao e Comunicacao" };
const secaoA = {
  id: "A",
  descricao: "Agricultura, Pecuária e Produção Florestal",
};

const sub = (
  id: string,
  descricao: string,
  classeId: string,
  grupoId: string,
  divisaoId: string,
  secao: { id: string; descricao: string },
  atividades?: readonly string[]
) => ({
  id,
  descricao,
  atividades: atividades ?? null,
  classe: {
    id: classeId,
    descricao,
    grupo: {
      id: grupoId,
      descricao: `Grupo ${grupoId}`,
      divisao: {
        id: divisaoId,
        descricao: `Divisao ${divisaoId}`,
        secao,
      },
    },
  },
});

const subclassesRows = [
  sub(
    "6201501",
    "Desenvolvimento de programas de computador sob encomenda",
    "62015",
    "620",
    "62",
    secaoJ,
    ["Desenvolvimento de software", "Programacao sob encomenda"]
  ),
  sub(
    "6202300",
    "Desenvolvimento e licenciamento de programas customizaveis",
    "62023",
    "620",
    "62",
    secaoJ
  ),
  sub("0111301", "Cultivo de arroz", "01113", "011", "01", secaoA),
];

const quote = (value: string) => `"${value}"`;

const subJson = (row: (typeof subclassesRows)[number]) =>
  `{"id":${quote(row.id)},"descricao":${quote(row.descricao)},"atividades":${
    row.atividades === null ? "null" : `[${Arr.join(Arr.map(row.atividades, quote), ",")}]`
  },"classe":{"id":${quote(row.classe.id)},"descricao":${quote(
    row.classe.descricao
  )},"grupo":{"id":${quote(row.classe.grupo.id)},"descricao":${quote(
    row.classe.grupo.descricao
  )},"divisao":{"id":${quote(row.classe.grupo.divisao.id)},"descricao":${quote(
    row.classe.grupo.divisao.descricao
  )},"secao":{"id":${quote(row.classe.grupo.divisao.secao.id)},"descricao":${quote(
    row.classe.grupo.divisao.secao.descricao
  )}}}}}}`;

const subclassesBody = `[${Arr.join(Arr.map(subclassesRows, subJson), ",")}]`;

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/subclasses"),
    respond: {
      body: subclassesBody,
      headers: { "content-type": "application/json" },
    },
  },
]);

const Infra = Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture);

const TestLayer = CnaeLive.pipe(Layer.provideMerge(Infra));

const seeded = Effect.gen(function* () {
  const cnae = yield* Cnae;
  yield* cnae.index;
  return cnae;
});

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "cnae store + bm25 + fuzzy search",
  (it) => {
    it.effect("resolve strips the mask and returns the full hierarchy, else NOT_FOUND", () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const found = yield* cnae.resolve("6201-5/01");
        expect(found.subclasse.id).toBe("6201501");
        expect(found.secao.id).toBe("J");
        expect(found.classe.id).toBe("62015");
        const error = yield* Effect.flip(cnae.resolve("9999999"));
        expect(error._tag).toBe("CnaeError");
        expect(error).toMatchObject({ code: "cnae.NOT_FOUND" });
        expect(error.message).toContain("nao encontrada");
      })
    );

    it.effect("search ranks by DuckDB bm25 relevance and honors the limit", () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const rows = yield* cnae.search("desenvolvimento de programas");
        expect(["6201501", "6202300"]).toContain(
          Option.getOrUndefined(Option.map(Arr.head(rows), (r) => r.id))
        );
        expect(Option.map(Arr.head(rows), (r) => r.secaoId)).toEqual(Option.some("J"));
        const licenciamento = yield* cnae.search("licenciamento");
        expect(Option.map(Arr.head(licenciamento), (r) => r.id)).toEqual(Option.some("6202300"));
        expect(Option.map(Arr.head(licenciamento), (r) => Number(r.score) > 0)).toEqual(
          Option.some(true)
        );
        const limited = yield* cnae.search("desenvolvimento de programas", {
          limit: 1,
        });
        expect(limited).toHaveLength(1);
        const semLexical = yield* cnae.search("zzzz sem termo lexical");
        expect(semLexical).toHaveLength(0);
      })
    );

    it.effect("a typo with no bm25 hit falls back to fff fuzzy", () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const rows = yield* cnae.search("licenciamnto");
        expect(Option.map(Arr.head(rows), (r) => r.id)).toEqual(Option.some("6202300"));
        expect(Option.map(Arr.head(rows), (r) => r.score)).toEqual(Option.some(0));
      })
    );

    it.effect("search normalizes the accented query against the haystack", () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const rows = yield* cnae.search("pecuária");
        expect(Option.map(Arr.head(rows), (r) => r.id)).toEqual(Option.some("0111301"));
      })
    );

    it.effect("listByLevel resolves each level and fails on an unknown format", () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const secao = yield* cnae.listByLevel("j");
        expect(secao.nivel).toBe("secao");
        expect(secao.codigo).toBe("J");
        expect(Arr.map(secao.subclasses, (s) => s.id)).toEqual(["6201501", "6202300"]);
        const divisao = yield* cnae.listByLevel("62");
        expect(divisao.nivel).toBe("divisao");
        expect(divisao.total).toBe(2);
        const grupo = yield* cnae.listByLevel("620");
        expect(grupo.nivel).toBe("grupo");
        expect(grupo.total).toBe(2);
        const classe = yield* cnae.listByLevel("62015");
        expect(classe.nivel).toBe("classe");
        expect(classe.total).toBe(1);
        const subclasse = yield* cnae.listByLevel("6201-5/01");
        expect(subclasse.nivel).toBe("subclasse");
        expect(subclasse.codigo).toBe("6201501");
        expect(subclasse.total).toBe(1);
        const error = yield* Effect.flip(cnae.listByLevel("1234"));
        expect(error).toMatchObject({ code: "cnae.LEVEL_UNRECOGNIZED" });
        const empty = yield* Effect.flip(cnae.listByLevel(""));
        expect(empty).toMatchObject({ code: "cnae.LEVEL_UNRECOGNIZED" });
      })
    );

    it.effect("index returns the row count and persists rows in the DuckDB file", () =>
      Effect.gen(function* () {
        const cnae = yield* Cnae;
        const indexed = yield* cnae.index;
        const duck = yield* Duck;
        const total = yield* duck.count(cnaeTable);
        expect(indexed).toBe(3);
        expect(total).toBe(3);
      })
    );
  }
);
