import { Effect } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { Db } from "../../kernel/db/client";
import { precoPraticado } from "../../kernel/db/schemas/preco-praticado";
import { Http } from "../../kernel/http/client";
import {
  consultarMaterialUrl,
  mapPrecos,
  maxPaginas,
  PrecoPayload,
  type PrecoFlat,
} from "./catalog";

const chunkSize = 2_000;

const chunks = <A>(items: readonly A[]) =>
  pipe(items, Arr.chunksOf(chunkSize));

const insertRows = (rows: readonly PrecoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(precoPraticado).values([...batch])),
    { concurrency: 1, discard: true }
  );

const fetchPage = (codigo: string, pagina: number) =>
  Effect.flatMap(Http, (http) =>
    http.json(consultarMaterialUrl(codigo, pagina), PrecoPayload, {
      headers: { accept: "application/json" },
    })
  ).pipe(
    Effect.map((payload) => ({
      resultado: payload.resultado ?? [],
      totalPaginas: payload.totalPaginas ?? 1,
    }))
  );

const fetchItem = (codigo: string) =>
  Effect.gen(function* () {
    const first = yield* fetchPage(codigo, 1);
    const pages = Math.min(first.totalPaginas, maxPaginas);
    const rest = yield* Effect.forEach(
      Arr.makeBy(Math.max(pages - 1, 0), (index) => index + 2),
      (pagina) => fetchPage(codigo, pagina).pipe(Effect.map((r) => r.resultado)),
      { concurrency: 2 }
    );
    return Arr.flatten([first.resultado, ...rest]);
  });

const dedup = (rows: readonly PrecoFlat[]) => {
  const seen = new Set<string>();
  return Arr.filter(rows, (row) =>
    row.idItemCompra === null
      ? true
      : seen.has(row.idItemCompra)
        ? false
        : (seen.add(row.idItemCompra), true)
  );
};

export const indexItens = (codigos: readonly string[]) =>
  Effect.gen(function* () {
    const perItem = yield* Effect.forEach(
      codigos,
      (codigo) => fetchItem(codigo).pipe(Effect.map(mapPrecos)),
      { concurrency: 2 }
    );
    const rows = dedup(Arr.flatten(perItem));
    yield* insertRows(rows);
    return rows.length;
  });
