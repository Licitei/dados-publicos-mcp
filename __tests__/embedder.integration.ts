import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Embedder, EmbedderLive } from "../src/kernel/embed/embedder";

describe("kernel/embed (integration, real model, network)", () => {
  test("embeds query and passage with semantic similarity", async () => {
    const cosine = await Effect.runPromise(
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
        return {
          related: dot(query, related),
          unrelated: dot(query, unrelated),
        };
      }).pipe(Effect.provide(EmbedderLive))
    );

    expect(cosine.related).toBeGreaterThan(cosine.unrelated);
    expect(cosine.related).toBeGreaterThan(0.8);
  }, 120_000);
});
