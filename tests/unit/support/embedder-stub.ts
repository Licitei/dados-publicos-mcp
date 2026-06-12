import { Effect, Layer } from "effect";
import { Embedder, embeddingDimensions } from "../../../src/kernel/embed/embedder";

export const EmbedderStub = Layer.succeed(Embedder, {
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
