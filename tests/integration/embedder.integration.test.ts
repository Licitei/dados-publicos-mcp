import { describe, expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { Embedder, EmbedderLive } from "../../src/kernel/embed/embedder";

const dot = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) =>
  Arr.reduce(Arr.zip(a, b), 0, (sum, [left, right]) => sum + left * right);

const firstVector = (vectors: ReadonlyArray<ReadonlyArray<number>>) =>
  Arr.head(vectors).pipe(Option.getOrElse((): ReadonlyArray<number> => []));

const secondVector = (vectors: ReadonlyArray<ReadonlyArray<number>>) =>
  Arr.get(vectors, 1).pipe(Option.getOrElse((): ReadonlyArray<number> => []));

layer(EmbedderLive, { excludeTestServices: true })(
  "kernel/embed (integration, real model, network)",
  (it) => {
    it.effect(
      "embeds query and passage with semantic similarity",
      () =>
        Effect.gen(function* () {
          const embedder = yield* Embedder;
          const queries = yield* embedder.embed("query", [
            "nova lei de licitacoes",
          ]);
          const query = firstVector(queries);
          const passages = yield* embedder.embed("passage", [
            "a Lei 14.133 trata de licitacoes e contratos",
            "receita de bolo de cenoura com cobertura",
          ]);
          const related = firstVector(passages);
          const unrelated = secondVector(passages);
          expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
          expect(dot(query, related)).toBeGreaterThan(0.8);
        }),
      120_000
    );
  }
);
