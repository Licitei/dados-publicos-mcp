import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../src/kernel/duck/duck";
import { fornecedorTable } from "../../src/sources/sicaf-fornecedores/catalog";
import { Sicaf, SicafLive } from "../../src/sources/sicaf-fornecedores/store";
import { fixtureLayer } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const pj = (
  cnpj: string,
  nome: string,
  uf: string,
  municipio: string,
  ativo: boolean,
  cnae: number,
  habilitado = ativo
) =>
  `{"cnpj":"${cnpj}","cpf":null,"nomeRazaoSocialFornecedor":"${nome}","ativo":${ativo},"habilitadoLicitar":${habilitado},"ufSigla":"${uf}","nomeMunicipio":"${municipio}","codigoCnae":${cnae},"nomeCnae":"Cnae ${cnae}","naturezaJuridicaId":2062,"naturezaJuridicaNome":"LTDA","porteEmpresaId":3,"porteEmpresaNome":"ME"}`;

const page = (resultado: readonly string[], totalPaginas: number) =>
  `{"resultado":[${Arr.join(resultado, ",")}],"totalRegistros":${resultado.length},"totalPaginas":${totalPaginas}}`;

const pageQuery =
  (ativo: string, pagina: string) =>
  (url: URL): boolean =>
    url.searchParams.get("ativo") === ativo && url.searchParams.get("pagina") === pagina;

const HttpFixture = fixtureLayer([
  {
    match: pageQuery("true", "1"),
    respond: {
      body: page(
        [
          pj("11222333000181", "Alpha Tecnologia LTDA", "SP", "São Paulo", true, 6201501, false),
          pj("44555666000199", "Beta Construcoes LTDA", "MG", "Belo Horizonte", true, 4120400),
        ],
        2
      ),
    },
  },
  {
    match: pageQuery("true", "2"),
    respond: {
      body: page(
        [pj("77888999000122", "Gamma Servicos LTDA", "SP", "Sao Paulo", true, 6201501)],
        2
      ),
    },
  },
  {
    match: pageQuery("false", "1"),
    respond: {
      body: page(
        [pj("00111222000133", "Delta Inativa LTDA", "RJ", "Rio de Janeiro", false, 4120400)],
        1
      ),
    },
  },
]);

const TestLayer = SicafLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "sicaf store + pagination + bm25",
  (it) => {
    it.effect("index streams every active + inactive page and counts all rows", () =>
      Effect.gen(function* () {
        const sicaf = yield* Sicaf;
        const total = yield* sicaf.index;
        expect(total).toBe(4);
        const duck = yield* Duck;
        const persisted = yield* duck.count(fornecedorTable);
        expect(persisted).toBe(4);
      })
    );
  }
);
