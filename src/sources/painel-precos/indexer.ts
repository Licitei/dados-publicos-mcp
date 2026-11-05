import { Effect } from "effect";
import * as Arr from "effect/Array";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import {
  consultarMaterialUrl,
  mapPrecos,
  maxPaginas,
  PrecoPayload,
  precoPraticadoTable,
  type PrecoFlat,
} from "./catalog";

const insertRows = (rows: readonly PrecoFlat[], firstId: number) =>
  appendRows(
    precoPraticadoTable,
    Arr.map(rows, (row, position) => ({ id: firstId + position, ...row }))
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

export const indexItens = (input: {
  readonly codigos: readonly string[];
  readonly firstId: number;
}) =>
  Effect.gen(function* () {
    const perItem = yield* Effect.forEach(
      input.codigos,
      (codigo) => fetchItem(codigo).pipe(Effect.map(mapPrecos)),
      { concurrency: 2 }
    );
    const rows = dedup(Arr.flatten(perItem));
    yield* insertRows(rows, input.firstId);
    return rows.length;
  });
