import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import { LocalDatabase } from "./local-database";
import { providers } from "./local-index.run";

export default Alchemy.Stack(
  "DadosPublicosLocal",
  {
    providers: providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const database = yield* LocalDatabase("local-db", {});
    return {
      dataDir: database.dataDir,
      tables: database.tables,
    };
  })
);
