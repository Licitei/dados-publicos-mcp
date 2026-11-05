import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { pipeline } from "@huggingface/transformers";
import { embeddingDimensions } from "./dimensions";

const EmbedKind = Schema.Literals(["query", "passage"]);
export type EmbedKind = (typeof EmbedKind)["Type"];

const prefix = {
  query: "query: ",
  passage: "passage: ",
} satisfies Record<EmbedKind, string>;

const EmbedErrorCode = Schema.Literals(["embed.LOAD", "embed.RUN"]);
export type EmbedErrorCode = (typeof EmbedErrorCode)["Type"];

export class EmbedError extends Schema.TaggedError<EmbedError, { readonly brand: unique symbol }>()(
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

const EmbedDtype = Schema.Literals(["fp32", "fp16", "q8", "int8", "uint8", "q4"]);

const EmbedConfigSchema = Schema.Struct({
  model: Schema.String,
  dimensions: Schema.Finite,
  dtype: EmbedDtype,
});
export type EmbedConfig = (typeof EmbedConfigSchema)["Type"];

export const EmbedConfig = Context.Reference<EmbedConfig>(
  "dados-publicos-mcp/EmbedConfig",
  {
    defaultValue: () => ({
      model: "Xenova/multilingual-e5-small",
      dimensions: embeddingDimensions,
      dtype: "fp32",
    }),
  }
);

const makeEmbedder = Effect.gen(function* () {
  const cfg = yield* EmbedConfig;
  const extractor = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => pipeline("feature-extraction", cfg.model, { dtype: cfg.dtype }),
      catch: (cause) => EmbedError.make({ code: "embed.LOAD", cause: String(cause) }),
    }),
    (instance) => Effect.promise(() => instance.dispose())
  );

  return {
    embed: (kind: EmbedKind, texts: readonly string[]) =>
      Effect.tryPromise({
        try: (): Promise<number[][]> =>
          extractor(
            pipe(
              texts,
              Arr.map((text) => prefix[kind] + text)
            ),
            { pooling: "mean", normalize: true }
          ).then((tensor) => tensor.tolist()),
        catch: (cause) => EmbedError.make({ code: "embed.RUN", cause: String(cause) }),
      }),
  };
});

export class Embedder extends Context.Service<
  Embedder,
  Effect.Success<typeof makeEmbedder>
>()("dados-publicos-mcp/kernel/embed/embedder") {}

export const EmbedderLive = Layer.effect(Embedder)(makeEmbedder);
