import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db } from "../../src/kernel/db/client";
import {
  CatmatCatser,
  CatmatCatserLive,
} from "../../src/sources/catmat-catser/store";
import { EmbedderStub } from "./support/embedder-stub";
import { TestDbLive } from "./support/test-db";

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
  servico(
    5001,
    "Servico de limpeza predial e conservacao",
    1000,
    "Limpeza",
    10001,
    "Predial"
  ),
  servico(
    5002,
    "Manutencao de computadores e notebooks",
    2000,
    "Suporte",
    20001,
    "Tecnico"
  ),
];

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const pagina = url.searchParams.get("pagina") ?? "1";
  const rows = url.pathname.includes("modulo-material")
    ? pagina === "1"
      ? materiais
      : []
    : url.pathname.includes("modulo-servico")
      ? pagina === "1"
        ? servicos
        : []
      : null;
  return rows === null
    ? new Response("rota desconhecida", { status: 404 })
    : Response.json({ resultado: rows, totalPaginas: 1 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  CatmatCatserLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub))
  ),
  TestDbLive,
  EmbedderStub,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const catmat = yield* CatmatCatser;
  yield* catmat.index;
  return catmat;
});

describe("catmat-catser store + pagination + hybrid search", () => {
  it.effect(
    "index streams material + service pages and counts both tables",
    () =>
      Effect.gen(function* () {
        const catmat = yield* CatmatCatser;
        const total = yield* catmat.index;
        expect(total).toEqual({ materiais: 4, servicos: 2 });
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select
            (select count(*)::int from catmat_material) as materiais,
            (select count(*)::int from catser_service) as servicos`
        );
        expect(Number(rows[0].materiais)).toBe(4);
        expect(Number(rows[0].servicos)).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarMaterial hybrid RRF floats the lexical match to the top",
    () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const hits = yield* catmat.buscarMaterial("parafuso aco inox");
        expect(Number(hits[0].codigoItem)).toBe(1003);
        expect(Number(hits[0].score)).toBeGreaterThan(Number(hits[1].score));
        const limited = yield* catmat.buscarMaterial("computador", { limit: 1 });
        expect(limited).toHaveLength(1);
        const todos = yield* catmat.buscarMaterial("cadeira ergonomica");
        expect(todos.map((h) => Number(h.codigoItem))).toContain(1004);
        const ativos = yield* catmat.buscarMaterial("cadeira ergonomica", {
          apenasAtivos: true,
        });
        expect(ativos.map((h) => Number(h.codigoItem))).not.toContain(1004);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarServico ranks bm25 lexical hits and falls back to trgm on typos",
    () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const lexical = yield* catmat.buscarServico("manutencao computadores");
        expect(Number(lexical[0].codigoServico)).toBe(5002);
        const typo = yield* catmat.buscarServico("limpza");
        expect(typo.map((r) => Number(r.codigoServico))).toContain(5001);
        const none = yield* catmat.buscarServico("zzzzz inexistente xpto");
        expect(none).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "resolver returns the denormalized chain or fails NOT_FOUND",
    () =>
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
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "normalizarItemEdital fans out into materials + services",
    () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const out = yield* catmat.normalizarItemEdital(
          "manutencao de computadores e parafusos"
        );
        expect(out.materiais.map((m) => Number(m.codigoItem))).toContain(1003);
        expect(out.servicos.map((s) => Number(s.codigoServico))).toContain(5002);
        expect(out.materiais[0]).toHaveProperty("nomeGrupo");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "listByLevel filters by a denormalized hierarchy code",
    () =>
      Effect.gen(function* () {
        const catmat = yield* seeded;
        const grupo = yield* catmat.listByLevel({
          tipo: "material",
          nivel: "grupo",
          codigo: 70,
        });
        expect(grupo.total).toBe(2);
        expect(grupo.itens.map((i) => i.codigo).sort((a, b) => a - b)).toEqual([
          1001, 1002,
        ]);
        const svcGrupo = yield* catmat.listByLevel({
          tipo: "servico",
          nivel: "grupo",
          codigo: 100,
        });
        expect(
          svcGrupo.itens.map((i) => i.codigo).sort((a, b) => a - b)
        ).toEqual([5001, 5002]);
        const svcClasse = yield* catmat.listByLevel({
          tipo: "servico",
          nivel: "classe",
          codigo: 1000,
        });
        expect(svcClasse.itens.map((i) => i.codigo)).toEqual([5001]);
        const error = yield* Effect.flip(
          catmat.listByLevel({ tipo: "material", nivel: "xyz", codigo: 70 })
        );
        expect(error._tag).toBe("CatmatCatserError");
        expect(error.message).toContain("Nivel");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
