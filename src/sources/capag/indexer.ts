import { Effect, Match, Stream } from "effect";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { Http } from "../../kernel/http/client";
import { offsetPage, type OffsetState } from "../../kernel/http/paging";
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
} from "./catalog";

const fetchBytes = (url: string, accept: string) =>
  Effect.flatMap(Http, (http) => http.bytes(url, { headers: { accept } }));

const discoverLatest = (
  dataset: "estados" | "municipios",
  ceilingYear: number,
  pick: typeof latestCsvResource
) =>
  Effect.flatMap(Http, (http) =>
    http.json(packageShowUrl[dataset], PackageShowPayload, {
      headers: { accept: "application/json" },
    })
  ).pipe(
    Effect.flatMap((payload) =>
      Match.value(pick(payload, ceilingYear)).pipe(
        Match.when(Match.undefined, () =>
          Effect.fail(CapagError.make({ code: "capag.RESOURCE_MISSING", dataset }))
        ),
        Match.orElse((entry) => Effect.succeed(entry))
      )
    )
  );

const fetchEstados = (ceilingYear: number) =>
  Effect.gen(function* () {
    const latest = yield* discoverLatest("estados", ceilingYear, latestCsvResource);
    const ano = latest.year ?? ceilingYear;
    const bytes = yield* fetchBytes(latest.resource.url, "text/csv");
    const records = parseCsvRecords(bytes, csvOptions);
    return mapEstados(records, ano);
  });

const fetchMunicipios = (ceilingYear: number) =>
  Effect.gen(function* () {
    const latest = yield* discoverLatest("municipios", ceilingYear, latestXlsxResource);
    const anoBase = latest.year ?? ceilingYear;
    const posicao = extractPosicao(latest.name);
    const bytes = yield* fetchBytes(
      latest.resource.url,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const rows = yield* readXlsxSheet(bytes, matchMunicipiosSheet);
    return mapMunicipiosRows(rows, anoBase, posicao);
  });

const fetchEntesPage = (state: OffsetState) =>
  Effect.flatMap(Http, (http) =>
    http.json(
      `${siconfiEntesUrl}?limit=${siconfiPageSize}&offset=${state.offset}`,
      SiconfiEntesPayload,
      { headers: { accept: "application/json" } }
    )
  ).pipe(Effect.map((payload) => offsetPage(state, payload.items ?? [], payload.hasMore)));

const fetchEntes = Stream.paginate({ offset: 0, page: 1 }, fetchEntesPage).pipe(
  Stream.runCollect,
  Effect.map(mapEntes)
);

export const fetchSnapshot = (ceilingYear: number) =>
  Effect.all(
    {
      estados: fetchEstados(ceilingYear),
      municipios: fetchMunicipios(ceilingYear),
      entes: fetchEntes,
    },
    { concurrency: 2 }
  );
