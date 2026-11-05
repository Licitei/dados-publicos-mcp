import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { TceRsLive } from "../../src/sources/tce-rs/store";
import { TcePrLive } from "../../src/sources/tce-pr/store";
import { ComprasGovLive } from "../../src/sources/compras-gov/store";
import { BndesLive } from "../../src/sources/bndes/store";
import { IbamaLive } from "../../src/sources/ibama/store";
import { ListaSujaLive } from "../../src/sources/mte-lista-suja/store";
import { PortalTransparenciaLive } from "../../src/sources/portal-transparencia/store";
import { CvmLive } from "../../src/sources/cvm/store";
import { PgfnLive } from "../../src/sources/pgfn/store";
import { IndicesReajusteLive } from "../../src/sources/indices-reajuste/store";
import { describe, expect, it, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../src/kernel/duck/duck";
import { foldExit } from "../../src/serve/fold";
import { indexRegistry } from "../../src/serve/index-registry";
import { tools } from "../../src/serve/registry";
import { CamaraDeputadosLive } from "../../src/sources/camara-deputados/store";
import { CapagLive, capagMunicipioTable } from "../../src/sources/capag/store";
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
  SinapiLive,
  IndicesReajusteLive,
  PgfnLive,
  CvmLive,
  PortalTransparenciaLive,
  ListaSujaLive,
  IbamaLive,
  BndesLive,
  ComprasGovLive,
  TcePrLive,
  TceRsLive
).pipe(Layer.provideMerge(Infra));

const toolByName = (name: string) =>
  Arr.findFirst(tools, (tool) => tool.name === name).pipe(Effect.fromOption, Effect.orDie);

const firstText = (result: ReturnType<typeof foldExit>) =>
  Arr.head(result.content).pipe(
    Option.map((block) => block.text),
    Option.getOrElse(() => "")
  );

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
});

describe("serve tool layer", () => {
  it("registry exposes only the eight generic tools", () => {
    expect(Arr.map(tools, (tool) => tool.name)).toEqual([
      "fontes",
      "consultar_sql",
      "buscar",
      "acervo_buscar",
      "acervo_localizar",
      "acervo_ler",
      "indexar",
      "guia",
    ]);
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
        const tool = yield* toolByName("guia");
        const exit = yield* Effect.exit(tool.handle({ tema: "analise_cnpj" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("# Análise de CNPJ lite");
      })
    );

    it.effect("SQL returns local columns and rows through the tool", () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = yield* toolByName("consultar_sql");
        const result = yield* tool.handle({
          sql: "SELECT nome FROM municipio ORDER BY nome",
          limite: 1,
        });
        expect(result).toMatchObject({ linhas: [["Campinas"]] });
      })
    );

    it.effect("invalid arguments fold to the generic pt-BR message", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("consultar_sql");
        yield* Effect.forEach(
          [{ sql: 123 }, { sql: "SELECT 1", limite: 1001 }, { sql: "SELECT 1", limite: 0 }],
          (args) =>
            Effect.gen(function* () {
              const resultExit = yield* Effect.exit(tool.handle(args));
              const result = foldExit(resultExit);
              expect(result).toMatchObject({ isError: true });
              expect(firstText(result)).toBe("Parametros invalidos para a ferramenta.");
            })
        );
      })
    );

    it.effect("generic search resolves a declared table and rejects unsupported tables", () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = yield* toolByName("buscar");
        const resultExit = yield* Effect.exit(
          tool.handle({ tabela: "municipio", termo: "sao paulo" })
        );
        const result = foldExit(resultExit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("São Paulo");
        const rejectedExit = yield* Effect.exit(tool.handle({ tabela: "missing", termo: "sao" }));
        const rejected = foldExit(rejectedExit);
        expect(rejected).toMatchObject({ isError: true });
      })
    );

    it.effect(
      "generic search auto-indexes an empty light source and recovers typos with fuzzy",
      () =>
        Effect.gen(function* () {
          yield* seeded;
          const duck = yield* Duck;
          yield* duck.run("DELETE FROM municipio");
          const tool = yield* toolByName("buscar");
          const rows = yield* tool.handle({ tabela: "municipio", termo: "campnas", limite: 1 });
          expect(rows).toMatchObject([{ nome: "Campinas", score: 0 }]);
          const count = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM municipio"
          );
          expect(count).toEqual([{ n: 2 }]);
        })
    );

    it.effect("generic search refuses an empty heavy source with CLI guidance", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("buscar");
        const exit = yield* Effect.exit(tool.handle({ tabela: "pncp_item", termo: "cafe" }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toContain("bun src/index.ts index pncp");
      })
    );

    it.effect("generic search rebuilds a legacy fuzzy file whose keys differ from the table", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        const fuzzy = yield* Fuzzy;
        yield* duck.replace(capagMunicipioTable, [
          { id: "3509502:2026", codIbge: "3509502", nome: "Campinas", busca: "campinas" },
        ]);
        yield* fuzzy.write("capag_municipio", [["3509502", "campinas"]]);
        const tool = yield* toolByName("buscar");
        const rows = yield* tool.handle({ tabela: "capag_municipio", termo: "campnas", limite: 1 });
        expect(rows).toMatchObject([{ id: "3509502:2026", nome: "Campinas", score: 0 }]);
      })
    );

    it.effect("fontes includes declared columns, search fields and source availability", () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = yield* toolByName("fontes");
        const resultExit = yield* Effect.exit(tool.handle({}));
        const result = foldExit(resultExit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("ibge-localidades");
        expect(firstText(result)).toContain("VARCHAR");
        expect(firstText(result)).toContain("nomeNormalizado");
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

    it.effect("acervo_buscar greps the real corpus with fff and skips index READMEs", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("acervo_buscar");
        const exit = yield* Effect.exit(tool.handle({ acervo: "leis", termos: ["dispensável"] }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const text = firstText(result);
        expect(text).toContain("federal/br-federal-lei-2021-04-01-14133.md");
        expect(text).toContain("federal/br-federal-lei-1993-06-21-8666.md");
        expect(text).not.toContain("README.md");
      })
    );

    it.effect("acervo_buscar restricts by folder with dentro", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("acervo_buscar");
        const exit = yield* Effect.exit(
          tool.handle({ acervo: "precedentes", termos: ["adjudicação"], dentro: "tribunais/TCU/" })
        );
        const result = foldExit(exit);
        expect(firstText(result)).toContain("tcu-sumula-247.md");
      })
    );

    it.effect("acervo_localizar finds a norma by number in the file name", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("acervo_localizar");
        const exit = yield* Effect.exit(tool.handle({ acervo: "leis", consulta: "lei 14133" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(firstText(result)).toContain("br-federal-lei-2021-04-01-14133.md");
      })
    );

    it.effect("acervo_ler returns parsed frontmatter and body", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("acervo_ler");
        const exit = yield* Effect.exit(
          tool.handle({ acervo: "leis", caminho: "federal/br-federal-lei-2021-04-01-14133.md" })
        );
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const text = firstText(result);
        expect(text).toContain("LEI Nº 14.133, DE 1 DE ABRIL DE 2021");
        expect(text).toContain("Art. 75");
      })
    );

    it.effect("acervo_ler refuses paths outside the corpus", () =>
      Effect.gen(function* () {
        const tool = yield* toolByName("acervo_ler");
        const exit = yield* Effect.exit(
          tool.handle({ acervo: "leis", caminho: "../../etc/passwd" })
        );
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
