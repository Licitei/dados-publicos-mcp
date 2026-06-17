import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import { LocalDatabase, providers } from "./local-database";

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
