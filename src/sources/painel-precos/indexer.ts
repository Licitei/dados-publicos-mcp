import { Effect } from "effect";
import { Db } from "../../kernel/db/client";
import { precoPraticado } from "../../kernel/db/schemas/preco-praticado";
import { getJson } from "../../kernel/http/client";
import {
  consultarMaterialUrl,
  mapPrecos,
  maxPaginas,
  PrecoPayload,
  type PrecoFlat,
} from "./catalog";

const chunkSize = 2_000;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const chunks = <A>(items: readonly A[]) =>
  range(Math.ceil(items.length / chunkSize)).map((position) =>
    items.slice(position * chunkSize, position * chunkSize + chunkSize)
  );

const insertRows = (rows: readonly PrecoFlat[]) =>
  Effect.forEach(
    chunks(rows),
    (batch) =>
      Effect.flatMap(Db, (db) => db.insert(precoPraticado).values([...batch])),
    { concurrency: 1, discard: true }
  );

const fetchPage = (codigo: string, pagina: number) =>
  getJson(consultarMaterialUrl(codigo, pagina), PrecoPayload, {
    headers: { accept: "application/json" },
  }).pipe(
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
      range(Math.max(pages - 1, 0)).map((index) => index + 2),
      (pagina) => fetchPage(codigo, pagina).pipe(Effect.map((r) => r.resultado)),
      { concurrency: 2 }
    );
    return [first.resultado, ...rest].flat();
  });

const dedup = (rows: readonly PrecoFlat[]) => {
  const seen = new Set<string>();
  return rows.filter((row) =>
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
    const rows = dedup(perItem.flat());
    yield* insertRows(rows);
    return rows.length;
  });
