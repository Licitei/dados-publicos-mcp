import { BunRuntime } from "@effect/platform-bun";
import { Clock, Console, Effect, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { runtime } from "../../src/runtime";
import { Search } from "../../src/kernel/search/search";
import { Cnae } from "../../src/sources/cnae/store";
import { ReceitaCnpj } from "../../src/sources/receita-cnpj/store";

const runs = 20;

const percentile = (sorted: readonly number[], p: number) =>
  pipe(
    Arr.get(sorted, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))),
    Option.getOrElse(() => 0)
  );

const measure = <A, E, R>(label: string, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const first = yield* Effect.exit(effect);
    if (first._tag === "Failure") {
      yield* Console.log(`${label}: pulado (fonte nao indexada ou erro)`);
      return;
    }
    const samples = yield* Effect.forEach(Arr.range(1, runs), () =>
      Effect.gen(function* () {
        const start = yield* Clock.currentTimeNanos;
        yield* Effect.exit(effect);
        const end = yield* Clock.currentTimeNanos;
        return Number(end - start) / 1e6;
      })
    );
    const sorted = Arr.sort(samples, (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0));
    yield* Console.log(
      `${label}: p50 ${percentile(sorted, 50).toFixed(1)}ms  p95 ${percentile(sorted, 95).toFixed(1)}ms  (n=${runs})`
    );
  });

const bench = Effect.gen(function* () {
  const search = yield* Search;
  const cnae = yield* Cnae;
  const receita = yield* ReceitaCnpj;
  yield* measure(
    "fff grep leis 'dispensa de licitacao'",
    search.grep("leis", ["dispensa de licitação"], { limit: 20 })
  );
  yield* measure(
    "fff grep leis federal/ 'art. 75'",
    search.grep("leis", ["Art. 75"], { within: "federal/", limit: 20 })
  );
  yield* measure("fff localizar leis '14133'", search.find("leis", "lei 14133", { limit: 10 }));
  yield* measure(
    "fff grep precedentes 'sumula'",
    search.grep("precedentes", ["licitação"], { limit: 20 })
  );
  yield* measure("sqlite fts5 cnae 'transporte rodoviario'", cnae.search("transporte rodoviario"));
  yield* measure("duckdb lake consultar_cnpj", receita.consultarCnpj("00000000000191"));
  yield* measure(
    "duckdb lake buscar_empresa_por_nome 'banco do brasil'",
    receita.buscarEmpresaPorNome("banco do brasil")
  );
});

BunRuntime.runMain(
  Effect.promise(() => runtime.runPromise(bench)).pipe(
    Effect.ensuring(Effect.promise(() => runtime.dispose()))
  )
);
