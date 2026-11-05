import { describe, expect, it, layer } from "@effect/vitest";
import { Effect, Option } from "effect";
import * as Arr from "effect/Array";
import { Embedder, EmbedError } from "../../src/kernel/embed/embedder";
import { embeddingDimensions } from "../../src/kernel/embed/dimensions";
import { TestEmbedderLive } from "./support/test-embedder";

describe("kernel/embed", () => {
  layer(TestEmbedderLive)("with the stub layer", (it) => {
    it.effect("a consumer embeds passages through the service", () =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const vectors = yield* embedder.embed("passage", ["nova lei", "licitacoes"]);
        expect(vectors).toHaveLength(2);
        expect(Arr.head(vectors).pipe(Option.map((v) => v.length))).toEqual(
          Option.some(embeddingDimensions)
        );
      })
    );
  });

  it("EmbedError surfaces pt-BR messages per code", () => {
    expect(EmbedError.make({ code: "embed.LOAD" }).message).toContain(
      "modelo de embeddings"
    );
    expect(EmbedError.make({ code: "embed.RUN" }).message).toContain(
      "gerar os embeddings"
    );
  });
});
