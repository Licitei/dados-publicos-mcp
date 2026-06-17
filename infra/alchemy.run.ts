import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import { LocalDatabase } from "./local-database";
import { LocalIndex } from "./local-index";
import { providers } from "./local-index.run";

export default Alchemy.Stack(
  "DadosPublicosLocal",
  {
    providers: providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const database = yield* LocalDatabase("local-db", {});
    const cnae = yield* LocalIndex("cnae", { fonte: "cnae" });
    return {
      dataDir: database.dataDir,
      tables: database.tables,
      indexed: { fonte: cnae.fonte, rows: cnae.rows },
    };
  })
);
