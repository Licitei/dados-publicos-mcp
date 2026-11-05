import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Str from "effect/String";
import { sql } from "drizzle-orm";
import { Db } from "../../src/kernel/db/client";
import { Embedder } from "../../src/kernel/embed/embedder";
import { buildTree } from "../../src/sources/legislacao/catalog";
import {
  Legislacao,
  LegislacaoLive,
  replaceNorma,
  type NodeRow,
} from "../../src/sources/legislacao/store";
import { TestEmbedderLive } from "./support/test-embedder";
import { TestDbLive } from "./support/test-db";

const TestLayer = Layer.mergeAll(
  LegislacaoLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, TestEmbedderLive))),
  TestDbLive,
  TestEmbedderLive
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

const normaId2 = "lei-8666-1993";

const lines2 = [
  "CAPÍTULO II",
  "Da Licitação e Seus Princípios",
  "Art. 22. São modalidades de licitação:",
  "I - concorrência;",
  "II - tomada de preços;",
  "III - convite;",
];

const seedNorma = (id: string, titulo: string, fixture: readonly string[]) =>
  Effect.gen(function* () {
    const embedder = yield* Embedder;
    const nodes = buildTree({ id, titulo }, fixture);
    const passages = Arr.map(nodes, (n) =>
      Str.trim(`${n.label} ${n.heading} ${n.text}`)
    );
    const embeddings = yield* embedder.embed("passage", passages);
    const rows = Arr.map(
      nodes,
      (n, i) =>
        ({
          path: n.path,
          normaId: id,
          parentPath: n.parentPath,
          kind: n.kind,
          label: n.label,
          heading: n.heading,
          text: n.text,
          summary: Str.trim(`${n.label} ${n.heading}`),
          position: n.position,
          embedding: Option.getOrUndefined(Arr.get(embeddings, i)),
        }) satisfies NodeRow
    );
    yield* replaceNorma(id, rows);
    return nodes;
  });

const seed = seedNorma(normaId, "Lei 14.133/2021", lines);

layer(TestLayer, { timeout: Duration.seconds(60) })("legislacao store + query", (it) => {
  it.effect(
    "hybrid search ranks results and honors the norma filter",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const hits = yield* leg.search("licitacoes", { normaId });
        expect(hits.length).toBeGreaterThan(0);
        const scores = Arr.map(hits, (h) => Number(h.score));
        expect(
          Option.zipWith(Arr.head(scores), Arr.last(scores), (top, bottom) =>
            top >= bottom
          )
        ).toEqual(Option.some(true));
        expect(Arr.dedupe(Arr.map(hits, (h) => h.path)).length).toBe(
          hits.length
        );
      }),
  );

  it.effect(
    "an unknown norma filter returns no hits",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const hits = yield* leg.search("licitacoes", { normaId: "inexistente" });
        expect(hits).toEqual([]);
      }),
  );

  it.effect(
    "the norma filter never leaks nodes from another norma",
    () =>
      Effect.gen(function* () {
        yield* seed;
        yield* seedNorma(normaId2, "Lei 8.666/1993", lines2);
        const leg = yield* Legislacao;
        const hits = yield* leg.search("licitacao", { normaId });
        expect(hits.length).toBeGreaterThan(0);
        expect(Arr.every(hits, (h) => String(h.norma_id) === normaId)).toBe(true);
        const hits2 = yield* leg.search("licitacao", { normaId: normaId2 });
        expect(hits2.length).toBeGreaterThan(0);
        expect(Arr.every(hits2, (h) => String(h.norma_id) === normaId2)).toBe(true);
      }),
  );

  it.effect(
    "getToc returns the tree ordered by position from the root",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const toc = yield* leg.getToc(normaId);
        expect(Option.map(Arr.head(toc), (r) => Number(r.depth))).toEqual(
          Option.some(1)
        );
        expect(Option.map(Arr.head(toc), (r) => r.parentPath)).toEqual(
          Option.some(null)
        );
        const depths = Arr.map(toc, (row) => Number(row.depth));
        const sorted = Arr.sort(depths, Order.Number);
        expect(Arr.head(sorted)).toEqual(Option.some(1));
        expect(Option.map(Arr.last(sorted), (d) => d > 1)).toEqual(
          Option.some(true)
        );
      }),
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
      }),
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
      }),
  );

  it.effect(
    "getNode surfaces the structure summary",
    () =>
      Effect.gen(function* () {
        yield* seed;
        const leg = yield* Legislacao;
        const res = yield* leg.getNode("lei_14133_2021.tit_ii.cap_i.art17");
        expect(String(res.node.summary)).toContain("Art. 17");
      }),
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
        const childKinds = Arr.sort(Arr.map(res.children, (c) => c.kind), Order.String);
        expect(childKinds).toEqual(["inciso", "inciso", "paragrafo", "paragrafo"]);
      }),
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
        ).pipe(Effect.map(({ rows }) => rows));
        const root = "lei_14133_2021.tit_ii.cap_i.art17";
        expect(rows.length).toBeGreaterThan(1);
        expect(
          Arr.every(rows, (row) => {
            const path = String(row.path);
            return path === root || Str.startsWith(`${root}.`)(path);
          })
        ).toBe(true);
      }),
  );
});
