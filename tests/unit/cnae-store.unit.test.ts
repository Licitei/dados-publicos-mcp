import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db } from "../../src/kernel/db/client";
import { Cnae, CnaeLive } from "../../src/sources/cnae/store";
import { EmbedderStub } from "./support/embedder-stub";
import { TestDbLive } from "./support/test-db";

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

const subclassesFixture = [
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

const route = async (input: string | URL | Request): Promise<Response> => {
  const path = new URL(String(input)).pathname;
  return path.endsWith("/subclasses")
    ? Response.json(subclassesFixture)
    : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  CnaeLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub))),
  TestDbLive,
  EmbedderStub,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const cnae = yield* Cnae;
  yield* cnae.index;
  return cnae;
});

describe("cnae store + hybrid search", () => {
  it.effect(
    "resolve strips the mask and returns the full hierarchy, else NOT_FOUND",
    () =>
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
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "search ranks by hybrid RRF relevance and honors the limit",
    () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const rows = yield* cnae.search("desenvolvimento de programas");
        expect(["6201501", "6202300"]).toContain(rows[0].id);
        expect(rows[0].secaoId).toBe("J");
        const licenciamento = yield* cnae.search("licenciamento");
        expect(licenciamento[0].id).toBe("6202300");
        expect(Number(licenciamento[0].score)).toBeGreaterThan(1 / 61 + 1e-9);
        const limited = yield* cnae.search("desenvolvimento de programas", {
          limit: 1,
        });
        expect(limited).toHaveLength(1);
        const semantico = yield* cnae.search("zzzz sem termo lexical");
        expect(semantico.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "search normalizes the accented query against the haystack",
    () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const rows = yield* cnae.search("pecuária");
        expect(rows[0].id).toBe("0111301");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "listByLevel resolves each level and fails on an unknown format",
    () =>
      Effect.gen(function* () {
        const cnae = yield* seeded;
        const secao = yield* cnae.listByLevel("j");
        expect(secao.nivel).toBe("secao");
        expect(secao.codigo).toBe("J");
        expect(secao.subclasses.map((s) => s.id)).toEqual([
          "6201501",
          "6202300",
        ]);
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
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "index returns the row count and persists rows queryable via the raw Db handle",
    () =>
      Effect.gen(function* () {
        const cnae = yield* Cnae;
        const indexed = yield* cnae.index;
        expect(indexed).toBe(3);
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select count(*)::int as count from cnae`
        );
        expect(Number(rows[0].count)).toBe(3);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );
});
