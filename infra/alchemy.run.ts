import * as Alchemy from "alchemy";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { FonteKey, indexRegistry } from "../src/serve/index-registry";
import { LocalIndex } from "./local-index";
import { providers } from "./local-index.run";

const lightFontes = Arr.filter(FonteKey.literals, (fonte) => !indexRegistry[fonte].heavy);

export default Alchemy.Stack(
  "DadosPublicosLocal",
  {
    providers,
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const indexed = yield* Effect.forEach(
      lightFontes,
      (fonte) =>
        LocalIndex(fonte, { fonte }).pipe(
          Effect.map((resource) => ({
            fonte: resource.fonte,
            rows: resource.rows,
            version: resource.version,
          }))
        ),
      { concurrency: 1 }
    );
    return { indexed };
  })
);
