import { Effect, Match, Option, Stream } from "effect";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { getJson, httpResponse } from "../../kernel/http/client";
import { readXlsxSheet } from "../../kernel/xlsx/sheet";
import {
  CapagError,
  PackageShowPayload,
  SiconfiEntesPayload,
  csvOptions,
  extractPosicao,
  latestCsvResource,
  latestXlsxResource,
  mapEntes,
  mapEstados,
  mapMunicipiosRows,
  matchMunicipiosSheet,
  packageShowUrl,
  siconfiEntesUrl,
  siconfiPageSize,
  type EnteFlat,
  type EstadoFlat,
  type MunicipioFlat,
} from "./catalog";

const maxPages = 5_000;

const fetchBytes = (url: string, accept: string) =>
  httpResponse(url, { headers: { accept } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

const discoverLatest = (
  dataset: "estados" | "municipios",
  ceilingYear: number,
  pick: typeof latestCsvResource
) =>
  getJson(packageShowUrl[dataset], PackageShowPayload, {
    headers: { accept: "application/json" },
  }).pipe(
    Effect.flatMap((payload) =>
      Match.value(pick(payload, ceilingYear)).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(
            new CapagError({ code: "capag.RESOURCE_MISSING", dataset })
          )
        ),
        Match.orElse((entry) => Effect.succeed(entry))
      )
    )
  );

export const fetchEstados = (ceilingYear: number) =>
  Effect.gen(function* () {
    const latest = yield* discoverLatest("estados", ceilingYear, latestCsvResource);
    const ano = latest.year ?? ceilingYear;
    const records = parseCsvRecords(
      yield* fetchBytes(latest.resource.url, "text/csv"),
      csvOptions
    );
    return mapEstados(records, ano);
  });

export const fetchMunicipios = (ceilingYear: number) =>
  Effect.gen(function* () {
    const latest = yield* discoverLatest(
      "municipios",
      ceilingYear,
      latestXlsxResource
    );
    const anoBase = latest.year ?? ceilingYear;
    const posicao = extractPosicao(latest.name);
    const rows = yield* readXlsxSheet(
      yield* fetchBytes(
        latest.resource.url,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ),
      matchMunicipiosSheet
    );
    return mapMunicipiosRows(rows, anoBase, posicao);
  });

type PageState = { readonly offset: number; readonly page: number };

const fetchEntesPage = (state: PageState) =>
  getJson(
    `${siconfiEntesUrl}?limit=${siconfiPageSize}&offset=${state.offset}`,
    SiconfiEntesPayload,
    { headers: { accept: "application/json" } }
  ).pipe(
    Effect.map((payload) => {
      const items = payload.items ?? [];
      const stop =
        items.length === 0 || payload.hasMore !== true || state.page >= maxPages;
      const next = Match.value(stop).pipe(
        Match.when(true, () => Option.none<PageState>()),
        Match.orElse(() =>
          Option.some<PageState>({
            offset: state.offset + items.length,
            page: state.page + 1,
          })
        )
      );
      return [items, next] as const;
    })
  );

export const fetchEntes = Stream.paginate(
  { offset: 0, page: 1 },
  fetchEntesPage
).pipe(Stream.runCollect, Effect.map(mapEntes));

export type CapagSnapshot = {
  readonly estados: readonly EstadoFlat[];
  readonly municipios: readonly MunicipioFlat[];
  readonly entes: readonly EnteFlat[];
};

export const fetchSnapshot = (ceilingYear: number) =>
  Effect.all(
    {
      estados: fetchEstados(ceilingYear),
      municipios: fetchMunicipios(ceilingYear),
      entes: fetchEntes,
    },
    { concurrency: 2 }
  );
