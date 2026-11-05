import { describe, expect, it, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { foldExit } from "../../src/serve/fold";
import { indexRegistry } from "../../src/serve/index-registry";
import { tools } from "../../src/serve/registry";
import { CamaraDeputadosLive } from "../../src/sources/camara-deputados/store";
import { CapagLive } from "../../src/sources/capag/store";
import { CatmatCatserLive } from "../../src/sources/catmat-catser/store";
import { CmedAnvisaLive } from "../../src/sources/cmed-anvisa/store";
import { CnaeLive } from "../../src/sources/cnae/store";
import { IbgeLocalidades, IbgeLocalidadesLive } from "../../src/sources/ibge-localidades/store";
import { PainelPrecosLive } from "../../src/sources/painel-precos/store";
import { PncpLive } from "../../src/sources/pncp/store";
import { QueridoDiarioLive } from "../../src/sources/querido-diario/store";
import { ReceitaCnpjLive } from "../../src/sources/receita-cnpj/store";
import { SancoesCguLive } from "../../src/sources/sancoes-cgu/store";
import { IbgeEconomiaLive } from "../../src/sources/ibge-economia/store";
import { SenadoFederalLive } from "../../src/sources/senado/store";
import { SicafLive } from "../../src/sources/sicaf-fornecedores/store";
import { SiconfiFiscalLive } from "../../src/sources/siconfi-fiscal/store";
import { SinapiLive } from "../../src/sources/sinapi/store";
import { TcuInidoneosLive } from "../../src/sources/tcu-inidoneos/store";
import { TransparenciaDespesasLive } from "../../src/sources/transparencia-despesas/store";
import { TransferegovLive } from "../../src/sources/transferegov/store";
import { TseEleitoralLive } from "../../src/sources/tse-eleitoral/store";
import { TestDuckLive } from "./support/test-duck";
import { TestSearchLive } from "./support/test-search";
import { TestFuzzyLive } from "./support/test-fuzzy";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";

const MUNICIPIOS_JSON =
  '[{"id":3550308,"nome":"São Paulo","microrregiao":{"id":1,"nome":"Micro","mesorregiao":{"id":1,"nome":"Meso","UF":{"id":35,"sigla":"SP","nome":"Sao Paulo","regiao":{"id":5,"sigla":"SE","nome":"Sudeste"}}}}},{"id":3509502,"nome":"Campinas","microrregiao":{"id":1,"nome":"Micro","mesorregiao":{"id":1,"nome":"Meso","UF":{"id":35,"sigla":"SP","nome":"Sao Paulo","regiao":{"id":5,"sigla":"SE","nome":"Sudeste"}}}}}]';

const HttpFixture = fixtureLayer([
  { match: pathIncludes("/municipios"), respond: { body: MUNICIPIOS_JSON } },
]);

const Infra = Layer.mergeAll(TestDuckLive, TestSearchLive, TestFuzzyLive, HttpFixture);

const TestLayer = Layer.mergeAll(
  IbgeLocalidadesLive,
  CnaeLive,
  CatmatCatserLive,
  SicafLive,
  SancoesCguLive,
  ReceitaCnpjLive,
  TseEleitoralLive,
  CamaraDeputadosLive,
  QueridoDiarioLive,
  CapagLive,
  PncpLive,
  TcuInidoneosLive,
  IbgeEconomiaLive,
  SenadoFederalLive,
  CmedAnvisaLive,
  SiconfiFiscalLive,
  TransferegovLive,
  PainelPrecosLive,
  TransparenciaDespesasLive,
  SinapiLive
).pipe(Layer.provideMerge(Infra));

const toolByName = (name: string) =>
  Arr.findFirst(tools, (tool) => tool.name === name).pipe(Effect.fromOption, Effect.orDie);

const firstText = (result: ReturnType<typeof foldExit>) =>
  Arr.head(result.content).pipe(
    Option.map((block) => block.text),
    Option.getOrElse(() => "")
  );

const UfBody = Schema.fromJsonString(Schema.Struct({ sigla: Schema.String, id: Schema.Finite }));

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
});

describe("serve tool layer", () => {
  it("registry exposes query + acervo + 1 indexar + 1 status + 5 guia tools", () => {
    const names = Arr.map(tools, (tool) => tool.name);
    expect(Arr.filter(names, Str.startsWith("indexar"))).toEqual(["indexar"]);
    Arr.forEach(
      [
        "status_indices",
        "indexar",
        "buscar_leis",
        "localizar_leis",
        "ler_leis",
        "buscar_precedentes",
        "localizar_precedentes",
        "ler_precedentes",
        "resolver_municipio",
        "guia_uso",
        "verificar_inidoneo_tcu",
        "economia_municipio",
        "buscar_senador",
        "buscar_medicamento_cmed",
        "fiscal_ente_siconfi",
        "buscar_convenio",
        "estatistica_preco_item",
        "buscar_despesa_federal",
        "buscar_insumo_sinapi",
      ],
      (name) => expect(names).toContain(name)
    );
  });

  it("every tool exposes an object inputSchema for the wire", () => {
    Arr.forEach(tools, (tool) => {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.description).toBe("string");
    });
  });

  layer(TestLayer, {
    timeout: Duration.seconds(60),
    excludeTestServices: true,
  })("with the real layers", (it) => {
    it.effect("guia tools fold their markdown into raw text content", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("guia_triagem_fornecedor");
        const exit = yield* Effect.exit(tool.handle({}));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("# Guia: triagem de fornecedor");
      })
    );

    it.effect("success path folds the service value into text content", () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = yield* toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: "sp" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const decoded = yield* Schema.decodeEffect(UfBody)(firstText(result));
        expect(decoded).toMatchObject({ sigla: "SP", id: 35 });
      })
    );

    it.effect("SchemaError on invalid args folds to the generic pt-BR message", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: 123 }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toBe("Parametros invalidos para a ferramenta.");
      })
    );

    it.effect("a source TaggedError folds to its pt-BR get message()", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: "XX" }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toContain("UF invalida: XX");
      })
    );

    it.effect("the resolver_municipio descriptor maps nome/uf to the service", () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = yield* toolByName("resolver_municipio");
        const exit = yield* Effect.exit(tool.handle({ nome: "sao paulo", uf: "SP" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("São Paulo");
      })
    );

    it.effect("the index-registry runs a light source against the fixture server", () =>
      Effect.gen(function* () {
        const entry = indexRegistry["ibge-localidades"];
        expect(entry.heavy).toBe(false);
        const summary = yield* entry.run({});
        expect(summary).toBe(2);
      })
    );

    it.effect("buscar_leis greps the real corpus with fff and skips index READMEs", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("buscar_leis");
        const exit = yield* Effect.exit(tool.handle({ termos: ["dispensável"] }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const text = firstText(result);
        expect(text).toContain("federal/br-federal-lei-2021-04-01-14133.md");
        expect(text).toContain("federal/br-federal-lei-1993-06-21-8666.md");
        expect(text).not.toContain("README.md");
      })
    );

    it.effect("buscar_leis restricts by folder with dentro", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("buscar_precedentes");
        const exit = yield* Effect.exit(
          tool.handle({ termos: ["adjudicação"], dentro: "tribunais/TCU/" })
        );
        const result = foldExit(exit);
        expect(firstText(result)).toContain("tcu-sumula-247.md");
      })
    );

    it.effect("localizar_leis finds a norma by number in the file name", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("localizar_leis");
        const exit = yield* Effect.exit(tool.handle({ consulta: "lei 14133" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("br-federal-lei-2021-04-01-14133.md");
      })
    );

    it.effect("ler_leis returns parsed frontmatter and body", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("ler_leis");
        const exit = yield* Effect.exit(
          tool.handle({ caminho: "federal/br-federal-lei-2021-04-01-14133.md" })
        );
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const text = firstText(result);
        expect(text).toContain("LEI Nº 14.133, DE 1 DE ABRIL DE 2021");
        expect(text).toContain("Art. 75");
      })
    );

    it.effect("ler_leis refuses paths outside the corpus", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("ler_leis");
        const exit = yield* Effect.exit(tool.handle({ caminho: "../../etc/passwd" }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toContain("Caminho inválido no acervo leis.");
      })
    );

    it.effect("indexar refuses heavy sources and points to the CLI", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("indexar");
        const exit = yield* Effect.exit(tool.handle({ fonte: "leis" }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toContain("dados-publicos-mcp index leis");
      })
    );
  });
});
