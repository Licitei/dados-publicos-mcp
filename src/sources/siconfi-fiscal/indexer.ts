import { Effect, Match, Option, Stream } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import { Db } from "../../kernel/db/client";
import { siconfiFato } from "../../kernel/db/schemas/siconfi-fato";
import { Http } from "../../kernel/http/client";
import {
  dcaUrl,
  mapFatos,
  rgfUrl,
  rreoUrl,
  SiconfiPayload,
  type Demonstrativo,
  type SiconfiFatoFlat,
} from "./catalog";

const chunkSize = 2_000;
const maxPages = 5_000;

const insertRows = (rows: readonly SiconfiFatoFlat[]) =>
  Effect.forEach(
    pipe(rows, Arr.chunksOf(chunkSize)),
    (batch) => Effect.flatMap(Db, (db) => db.insert(siconfiFato).values([...batch])),
    { concurrency: 1, discard: true }
  );

type PageState = { readonly offset: number; readonly page: number };

const urlFor = {
  DCA: dcaUrl,
  RREO: rreoUrl,
  RGF: rgfUrl,
} satisfies Record<Demonstrativo, (idEnte: string, ano: number, offset: number) => string>;

const fetchPage =
  (idEnte: string, ano: number, demonstrativo: Demonstrativo) =>
  (state: PageState) =>
    Effect.flatMap(Http, (http) =>
      http.json(urlFor[demonstrativo](idEnte, ano, state.offset), SiconfiPayload, {
        headers: { accept: "application/json" },
      })
    ).pipe(
      Effect.map((payload) => {
        const items = payload.items ?? [];
        const stop =
          items.length === 0 ||
          payload.hasMore !== true ||
          state.page >= maxPages;
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

const fetchDemonstrativo = (
  idEnte: string,
  ano: number,
  demonstrativo: Demonstrativo
) =>
  Stream.paginate(
    { offset: 0, page: 1 },
    fetchPage(idEnte, ano, demonstrativo)
  ).pipe(
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
    Effect.map(mapFatos(idEnte, demonstrativo))
  );

const indexEnteImpl = (idEnte: string, ano: number) =>
  Effect.all(
    {
      dca: fetchDemonstrativo(idEnte, ano, "DCA"),
      rreo: fetchDemonstrativo(idEnte, ano, "RREO"),
      rgf: fetchDemonstrativo(idEnte, ano, "RGF"),
    },
    { concurrency: 2 }
  ).pipe(
    Effect.map(({ dca, rreo, rgf }) =>
      pipe(dca, Arr.appendAll(rreo), Arr.appendAll(rgf))
    ),
    Effect.flatMap((rows) => insertRows(rows).pipe(Effect.as(rows.length)))
  );

export const indexEnte: {
  (ano: number): (idEnte: string) => ReturnType<typeof indexEnteImpl>;
  (idEnte: string, ano: number): ReturnType<typeof indexEnteImpl>;
} = dual(2, indexEnteImpl);
