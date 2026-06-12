import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  Embedder,
  EmbedError,
  embeddingDimensions,
} from "../src/kernel/embed/embedder";

const EmbedderStub = Layer.succeed(Embedder, {
  embed: (kind, texts) =>
    Effect.succeed(
      texts.map((text) =>
        Array.from(
          { length: embeddingDimensions },
          (_, i) => ((text.length + kind.length + i) % 13) / 13
        )
      )
    ),
});

describe("kernel/embed", () => {
  test("a consumer embeds passages through the service", async () => {
    const vectors = await Effect.runPromise(
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        return yield* embedder.embed("passage", ["nova lei", "licitacoes"]);
      }).pipe(Effect.provide(EmbedderStub))
    );

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(embeddingDimensions);
  });

  test("EmbedError surfaces pt-BR messages per code", () => {
    expect(new EmbedError({ code: "embed.LOAD" }).message).toContain(
      "modelo de embeddings"
    );
    expect(new EmbedError({ code: "embed.RUN" }).message).toContain(
      "gerar os embeddings"
    );
  });
});
