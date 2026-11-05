import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
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

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "cnae store + bm25 + fuzzy search",
  (it) => {
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
