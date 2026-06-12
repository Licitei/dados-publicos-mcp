import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { sql } from "drizzle-orm";
import { Db, DbLayer } from "../../src/kernel/db/client";
import { Embedder } from "../../src/kernel/embed/embedder";
import { buildTree } from "../../src/sources/legislacao/catalog";
import {
  Legislacao,
  LegislacaoLive,
  createSchema,
  replaceNorma,
  type NodeRow,
} from "../../src/sources/legislacao/store";
import { EmbedderStub } from "./support/embedder-stub";

const TestLayer = Layer.mergeAll(
  LegislacaoLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, EmbedderStub))),
  DbLayer,
  EmbedderStub
);

const normaId = "lei-14133-2021";

const lines = [
  "TÍTULO II",
  "Das Licitações",
  "CAPÍTULO I",
  "Do Processo Licitatório",
  "Art. 17. O processo de licitação observará as seguintes fases:",
  "I - preparatória;",
  "II - de divulgação do edital;",
  "§ 1º A fase preparatória é caracterizada pelo planejamento.",
  "Parágrafo único. Aplica-se o disposto neste artigo.",
  "Art. 18. A fase preparatória abrange:",
  "a) o objeto da contratação;",
];

const seed = Effect.gen(function* () {
  yield* createSchema;
  const embedder = yield* Embedder;
  const nodes = buildTree({ id: normaId, titulo: "Lei 14.133/2021" }, lines);
  const passages = nodes.map((n) => `${n.label} ${n.heading} ${n.text}`.trim());
  const embeddings = yield* embedder.embed("passage", passages);
  const rows = nodes.map(
    (n, i) =>
      ({
        path: n.path,
        normaId,
        parentPath: n.parentPath,
        kind: n.kind,
        label: n.label,
        heading: n.heading,
        text: n.text,
        summary: `${n.label} ${n.heading}`.trim(),
        position: n.position,
        embedding: embeddings[i],
      }) satisfies NodeRow
  );
  yield* replaceNorma(normaId, rows);
  return nodes;
});

describe("legislacao store + query", () => {
  it.effect(
    "hybrid search ranks results and honors the norma filter",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const hits = yield* leg.search("licitacoes", { normaId });
        expect(hits.length).toBeGreaterThan(0);
        const scores = hits.map((h) => Number(h.score));
        expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]);
        expect(new Set(hits.map((h) => h.path)).size).toBe(hits.length);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "an unknown norma filter returns no hits",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const hits = yield* leg.search("licitacoes", { normaId: "inexistente" });
        expect(hits).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "getToc returns the tree ordered by position from the root",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const toc = yield* leg.getToc(normaId);
        expect(Number(toc[0].depth)).toBe(1);
        expect(toc[0].parentPath).toBeNull();
        const depths = toc.map((row) => Number(row.depth));
        expect(Math.min(...depths)).toBe(1);
        expect(Math.max(...depths)).toBeGreaterThan(1);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "getArticle resolves a nested article by number",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const res = yield* leg.getArticle(normaId, "lei_14133_2021", 17);
        expect(res.node.kind).toBe("artigo");
        expect(res.node.label).toBe("Art. 17");
        expect(res.node.path).toBe("lei_14133_2021.tit_ii.cap_i.art17");
        expect(res.breadcrumb).toEqual([
          "Lei 14.133/2021",
          "TÍTULO II",
          "CAPÍTULO I",
        ]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "getArticle fails NODE_NOT_FOUND for an unknown article",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const error = yield* Effect.flip(
          leg.getArticle(normaId, "lei_14133_2021", 999)
        );
        expect(error._tag).toBe("LegislacaoError");
        expect(error.message).toContain("Trecho nao encontrado");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "getNode surfaces the structure summary",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const res = yield* leg.getNode("lei_14133_2021.tit_ii.cap_i.art17");
        expect(String(res.node.summary)).toContain("Art. 17");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "getNode resolves breadcrumb and direct children",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const res = yield* leg.getNode("lei_14133_2021.tit_ii.cap_i.art17");
        expect(res.node.kind).toBe("artigo");
        expect(res.node.label).toBe("Art. 17");
        expect(res.breadcrumb).toEqual([
          "Lei 14.133/2021",
          "TÍTULO II",
          "CAPÍTULO I",
        ]);
        const childKinds = res.children.map((c) => c.kind).sort();
        expect(childKinds).toEqual(["inciso", "inciso", "paragrafo", "paragrafo"]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "ltree subtree query returns only descendants of art17",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const db = yield* Db;
        const rows = yield* db.execute(
          sql`select path from legislacao_node
            where path <@ ${"lei_14133_2021.tit_ii.cap_i.art17"}::ltree
            order by position`
        );
        const root = "lei_14133_2021.tit_ii.cap_i.art17";
        expect(rows.length).toBeGreaterThan(1);
        for (const row of rows) {
          const path = String(row.path);
          expect(path === root || path.startsWith(`${root}.`)).toBe(true);
        }
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );
});
