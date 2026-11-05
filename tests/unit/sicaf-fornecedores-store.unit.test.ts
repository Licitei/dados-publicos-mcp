import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import { sql } from "drizzle-orm";
import { Db } from "../../src/kernel/db/client";
import { Sicaf, SicafLive } from "../../src/sources/sicaf-fornecedores/store";
import { fixtureLayer } from "./support/fixture-server";
import { TestDbLive } from "./support/test-db";

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
    url.searchParams.get("ativo") === ativo &&
    url.searchParams.get("pagina") === pagina;

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

const TestLayer = Layer.mergeAll(
  SicafLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpFixture))),
  TestDbLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const sicaf = yield* Sicaf;
  yield* sicaf.index;
  return sicaf;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("sicaf store + pagination + bm25", (it) => {
  it.effect(
    "index streams every active + inactive page and counts all rows",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* Sicaf;
        const total = yield* sicaf.index;
        expect(total).toBe(4);
        const db = yield* Db;
        const { rows } = yield* db.execute(
          sql`select count(*)::int as count from fornecedor`
        );
        expect(Option.map(Arr.head(rows), (r) => Number(r.count))).toEqual(
          Option.some(4)
        );
      }),
  );

  it.effect(
    "buscar filters by bm25 name match and honors apenasAtivos + limit",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* seeded;
        const hit = yield* sicaf.buscar({ nome: "alpha tecnologia" });
        expect(Option.map(Arr.head(hit), (r) => r.cnpj)).toEqual(
          Option.some("11222333000181")
        );
        const limited = yield* sicaf.buscar({ nome: "ltda", limit: 1 });
        expect(limited).toHaveLength(1);
        const inativa = yield* sicaf.buscar({ nome: "inativa" });
        expect(Arr.map(inativa, (r) => r.cnpj)).toEqual(["00111222000133"]);
        const ativos = yield* sicaf.buscar({ nome: "inativa", apenasAtivos: true });
        expect(ativos).toHaveLength(0);
        const fuzzy = yield* sicaf.buscar({ nome: "constru" });
        expect(Arr.map(fuzzy, (r) => r.cnpj)).toContain("44555666000199");
        const none = yield* sicaf.buscar({ nome: "zzzzz inexistente" });
        expect(none).toHaveLength(0);
      }),
  );

  it.effect(
    "habilitado returns encontrado=false on miss, the row on hit, never fails",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* seeded;
        const miss = yield* sicaf.habilitado("99.999.999/0001-99");
        expect(miss).toMatchObject({
          encontrado: false,
          fornecedor: null,
          cnpj: "99999999000199",
        });
        const hit = yield* sicaf.habilitado("11.222.333/0001-81");
        expect(hit.encontrado).toBe(true);
        expect(hit.ativo).toBe(true);
        expect(hit.habilitadoLicitar).toBe(false);
        expect(hit.fornecedor?.nomeRazaoSocial).toContain("Alpha");
      }),
  );

  it.effect(
    "listar filters uf/cnae/municipio (accent-insensitive) + apenasAtivos",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* seeded;
        const sp = yield* sicaf.listar({ uf: "sp" });
        expect(Arr.sort(Arr.map(sp, (r) => r.cnpj ?? ""), Order.String)).toEqual([
          "11222333000181",
          "77888999000122",
        ]);
        const saoPaulo = yield* sicaf.listar({ municipio: "sao paulo" });
        expect(saoPaulo).toHaveLength(2);
        const porCnae = yield* sicaf.listar({ cnae: 4120400 });
        expect(Arr.sort(Arr.map(porCnae, (r) => r.cnpj ?? ""), Order.String)).toEqual([
          "00111222000133",
          "44555666000199",
        ]);
        const ativos = yield* sicaf.listar({ cnae: 4120400, apenasAtivos: true });
        expect(Arr.map(ativos, (r) => r.cnpj)).toEqual(["44555666000199"]);
      }),
  );
});
