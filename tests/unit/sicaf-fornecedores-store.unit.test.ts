import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db } from "../../src/kernel/db/client";
import { Sicaf, SicafLive } from "../../src/sources/sicaf-fornecedores/store";
import { TestDbLive } from "./support/test-db";

const pj = (
  cnpj: string,
  nome: string,
  uf: string,
  municipio: string,
  ativo: boolean,
  cnae: number,
  habilitado = ativo
) => ({
  cnpj,
  cpf: null,
  nomeRazaoSocialFornecedor: nome,
  ativo,
  habilitadoLicitar: habilitado,
  ufSigla: uf,
  nomeMunicipio: municipio,
  codigoCnae: cnae,
  nomeCnae: `Cnae ${cnae}`,
  naturezaJuridicaId: 2062,
  naturezaJuridicaNome: "LTDA",
  porteEmpresaId: 3,
  porteEmpresaNome: "ME",
});

const activePages: Record<string, readonly unknown[]> = {
  "1": [
    pj("11222333000181", "Alpha Tecnologia LTDA", "SP", "São Paulo", true, 6201501, false),
    pj("44555666000199", "Beta Construcoes LTDA", "MG", "Belo Horizonte", true, 4120400),
  ],
  "2": [pj("77888999000122", "Gamma Servicos LTDA", "SP", "Sao Paulo", true, 6201501)],
};
const inactivePages: Record<string, readonly unknown[]> = {
  "1": [pj("00111222000133", "Delta Inativa LTDA", "RJ", "Rio de Janeiro", false, 4120400)],
};

const page = (resultado: readonly unknown[], totalPaginas: number) =>
  Response.json({ resultado, totalRegistros: resultado.length, totalPaginas });

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const pagina = url.searchParams.get("pagina") ?? "1";
  const ativo = url.searchParams.get("ativo");
  return ativo === "true"
    ? page(activePages[pagina] ?? [], 2)
    : ativo === "false"
      ? page(inactivePages[pagina] ?? [], 1)
      : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  SicafLive.pipe(Layer.provide(TestDbLive)),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const sicaf = yield* Sicaf;
  yield* sicaf.index;
  return sicaf;
});

describe("sicaf store + pagination + bm25", () => {
  it.effect(
    "index streams every active + inactive page and counts all rows",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* Sicaf;
        const total = yield* sicaf.index;
        expect(total).toBe(4);
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select count(*)::int as count from fornecedor`
        );
        expect(Number(rows[0].count)).toBe(4);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "buscar filters by bm25 name match and honors apenasAtivos + limit",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* seeded;
        const hit = yield* sicaf.buscar({ nome: "alpha tecnologia" });
        expect(hit[0].cnpj).toBe("11222333000181");
        const limited = yield* sicaf.buscar({ nome: "ltda", limit: 1 });
        expect(limited).toHaveLength(1);
        const inativa = yield* sicaf.buscar({ nome: "inativa" });
        expect(inativa.map((r) => r.cnpj)).toEqual(["00111222000133"]);
        const ativos = yield* sicaf.buscar({ nome: "inativa", apenasAtivos: true });
        expect(ativos).toHaveLength(0);
        const fuzzy = yield* sicaf.buscar({ nome: "constru" });
        expect(fuzzy.map((r) => r.cnpj)).toContain("44555666000199");
        const none = yield* sicaf.buscar({ nome: "zzzzz inexistente" });
        expect(none).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    30_000
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
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "listar filters uf/cnae/municipio (accent-insensitive) + apenasAtivos",
    () =>
      Effect.gen(function* () {
        const sicaf = yield* seeded;
        const sp = yield* sicaf.listar({ uf: "sp" });
        expect(sp.map((r) => r.cnpj).sort()).toEqual([
          "11222333000181",
          "77888999000122",
        ]);
        const saoPaulo = yield* sicaf.listar({ municipio: "sao paulo" });
        expect(saoPaulo).toHaveLength(2);
        const porCnae = yield* sicaf.listar({ cnae: 4120400 });
        expect(porCnae.map((r) => r.cnpj).sort()).toEqual([
          "00111222000133",
          "44555666000199",
        ]);
        const ativos = yield* sicaf.listar({ cnae: 4120400, apenasAtivos: true });
        expect(ativos.map((r) => r.cnpj)).toEqual(["44555666000199"]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );
});
