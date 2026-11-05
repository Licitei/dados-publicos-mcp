import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CorpusGitLive } from "../../../src/kernel/search/corpus";
import { SearchConfig, SearchLive } from "../../../src/kernel/search/search";

const lei14133 = `---
id: "br-federal-lei-2021-04-01-14133"
norma_tipo: "lei"
norma_numero: "14133"
titulo: "LEI Nº 14.133, DE 1 DE ABRIL DE 2021"
esfera: "federal"
---

# LEI Nº 14.133, DE 1 DE ABRIL DE 2021

Lei de Licitações e Contratos Administrativos.

Art. 75. É dispensável a licitação:
I - para contratação que envolva valores inferiores a R$ 100.000,00.
`;

const lei8666 = `---
id: "br-federal-lei-1993-06-21-8666"
norma_tipo: "lei"
titulo: "LEI Nº 8.666, DE 21 DE JUNHO DE 1993"
esfera: "federal"
---

Art. 24. É dispensável a licitação nos casos previstos.
`;

const sumula = `---
id: "tcu-sumula-247"
tribunal: "TCU"
---

# Súmula 247 do TCU

É obrigatória a admissão da adjudicação por item e não por preço global.
`;

const fixtureCorpora = {
  leis: [
    ["federal/br-federal-lei-2021-04-01-14133.md", lei14133],
    ["federal/br-federal-lei-1993-06-21-8666.md", lei8666],
    ["README.md", "# Leis\n\nlicitação aparece aqui mas é índice\n"],
  ],
  precedentes: [["tribunais/TCU/sumula/tcu-sumula-247.md", sumula]],
} as const;

const writeCorpora = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const write = (corpus: string, files: ReadonlyArray<readonly [string, string]>) =>
    Effect.forEach(
      files,
      ([relative, content]) => {
        const full = path.join(root, corpus, relative);
        return fs
          .makeDirectory(path.dirname(full), { recursive: true })
          .pipe(Effect.andThen(fs.writeFileString(full, content)));
      },
      { discard: true }
    );
  yield* write("leis", fixtureCorpora.leis);
  yield* write("precedentes", fixtureCorpora.precedentes);
  return {
    roots: { leis: path.join(root, "leis"), precedentes: path.join(root, "precedentes") },
    scanTimeoutMs: 10_000,
  };
});

const TestSearchConfig = Layer.effect(SearchConfig)(writeCorpora.pipe(Effect.orDie)).pipe(
  Layer.provide(BunServices.layer)
);

export const TestSearchLive = Layer.mergeAll(SearchLive, CorpusGitLive).pipe(
  Layer.provide(TestSearchConfig)
);
