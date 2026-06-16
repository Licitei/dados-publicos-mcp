import { Effect, Layer } from "effect";
import { Embedder } from "../../../src/kernel/embed/embedder";
import { embeddingDimensions } from "../../../src/kernel/embed/dimensions";

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
