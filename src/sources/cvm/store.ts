import { Context, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { Http } from "../../kernel/http/client";
import { cvmCompanhiaTable, cvmFundoTable, cvmProcessoTable, cvmAcusadoTable } from "./catalog";
import { loadCvm } from "./indexer";

const makeCvm = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;
  const http = yield* Http;
  const index = Effect.gen(function* () {
    const rows = yield* loadCvm.pipe(Effect.provideService(Http, http));
    const batches = [
      { table: cvmCompanhiaTable, rows: rows.companhias },
      { table: cvmFundoTable, rows: rows.fundos },
      { table: cvmProcessoTable, rows: rows.processos },
      { table: cvmAcusadoTable, rows: rows.acusados },
    ];
    const counts = yield* duck.transaction(
      Effect.forEach(batches, (batch) => duck.replace(batch.table, batch.rows), { concurrency: 1 })
    );
    yield* Effect.forEach(
      batches,
      (batch) =>
        fuzzy.write(
          batch.table.name,
          Arr.map(batch.rows, (row): readonly [string, string] => [row.id, row.busca])
        ),
      { concurrency: 1 }
    );
    return Arr.reduce(counts, 0, (total, count) => total + count);
  });
  return { index };
});
export class Cvm extends Context.Service<Cvm, Effect.Success<typeof makeCvm>>()(
  "dados-publicos-mcp/sources/cvm/store/Cvm"
) {}
export const CvmLive = Layer.effect(Cvm)(makeCvm);
