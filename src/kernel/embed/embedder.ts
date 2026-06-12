import { Context, Effect, Layer, Schema } from "effect";
import { pipeline } from "@huggingface/transformers";

export const embeddingDimensions = 384;

const EmbedKind = Schema.Literals(["query", "passage"]);
export type EmbedKind = (typeof EmbedKind)["Type"];

const prefix = {
  query: "query: ",
  passage: "passage: ",
} satisfies Record<EmbedKind, string>;

const EmbedErrorCode = Schema.Literals(["embed.LOAD", "embed.RUN"]);
export type EmbedErrorCode = (typeof EmbedErrorCode)["Type"];

export class EmbedError extends Schema.TaggedErrorClass<EmbedError>()(
  "EmbedError",
  {
    code: EmbedErrorCode,
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "embed.LOAD":
        return "Falha ao carregar o modelo de embeddings local.";
      case "embed.RUN":
        return "Falha ao gerar os embeddings.";
    }
  }
}

const EmbedConfigSchema = Schema.Struct({
  model: Schema.String,
  dimensions: Schema.Number,
});
export type EmbedConfig = (typeof EmbedConfigSchema)["Type"];

export const EmbedConfig = Context.Reference<EmbedConfig>(
  "dados-publicos-mcp/EmbedConfig",
  {
    defaultValue: () => ({
      model: "Xenova/multilingual-e5-small",
      dimensions: embeddingDimensions,
    }),
  }
);

export class Embedder extends Context.Service<
  Embedder,
  {
    readonly embed: (
      kind: EmbedKind,
      texts: readonly string[]
    ) => Effect.Effect<number[][], EmbedError>;
  }
>()("dados-publicos-mcp/Embedder") {}

export const EmbedderLive = Layer.effect(Embedder)(
  Effect.gen(function* () {
    const cfg = yield* EmbedConfig;
    const extractor = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => pipeline("feature-extraction", cfg.model),
        catch: (cause) => new EmbedError({ code: "embed.LOAD", cause: String(cause) }),
      }),
      (instance) => Effect.promise(() => instance.dispose())
    );

    return {
      embed: (kind, texts) =>
        Effect.tryPromise({
          try: async () => {
            const tensor = await extractor(
              texts.map((text) => prefix[kind] + text),
              { pooling: "mean", normalize: true }
            );
            return tensor.tolist();
          },
          catch: (cause) => new EmbedError({ code: "embed.RUN", cause: String(cause) }),
        }),
    };
  })
);
