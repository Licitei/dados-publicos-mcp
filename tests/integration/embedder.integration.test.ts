import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Embedder, EmbedderLive } from "../../src/kernel/embed/embedder";

describe("kernel/embed (integration, real model, network)", () => {
  it.effect(
    "embeds query and passage with semantic similarity",
    () =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const [query] = yield* embedder.embed("query", [
          "nova lei de licitacoes",
        ]);
        const [related, unrelated] = yield* embedder.embed("passage", [
          "a Lei 14.133 trata de licitacoes e contratos",
          "receita de bolo de cenoura com cobertura",
        ]);
        const dot = (a: number[], b: number[]) =>
          a.reduce((sum, value, i) => sum + value * b[i], 0);
        expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
        expect(dot(query, related)).toBeGreaterThan(0.8);
      }).pipe(Effect.provide(EmbedderLive)),
    120_000
  );
});
