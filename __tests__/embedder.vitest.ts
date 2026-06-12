import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  Embedder,
  EmbedError,
  embeddingDimensions,
} from "../src/kernel/embed/embedder";
import { EmbedderStub } from "./support/embedder-stub";

describe("kernel/embed", () => {
  it.effect("a consumer embeds passages through the service", () =>
    Effect.gen(function* () {
      const embedder = yield* Embedder;
      const vectors = yield* embedder.embed("passage", ["nova lei", "licitacoes"]);
      expect(vectors).toHaveLength(2);
      expect(vectors[0]).toHaveLength(embeddingDimensions);
    }).pipe(Effect.provide(EmbedderStub))
  );

  it("EmbedError surfaces pt-BR messages per code", () => {
    expect(new EmbedError({ code: "embed.LOAD" }).message).toContain(
      "modelo de embeddings"
    );
    expect(new EmbedError({ code: "embed.RUN" }).message).toContain(
      "gerar os embeddings"
    );
  });
});
