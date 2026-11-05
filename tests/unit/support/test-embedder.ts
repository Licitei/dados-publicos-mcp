import { Layer } from "effect";
import { EmbedConfig, EmbedderLive } from "../../../src/kernel/embed/embedder";
import { embeddingDimensions } from "../../../src/kernel/embed/dimensions";

export const TestEmbedderLive = EmbedderLive.pipe(
  Layer.provide(
    Layer.succeed(EmbedConfig)({
      model: "Xenova/multilingual-e5-small",
      dimensions: embeddingDimensions,
      dtype: "q8",
    })
  )
);
