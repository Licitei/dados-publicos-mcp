import { Effect, Match, Option, Stream } from "effect";
import { Db } from "../../kernel/db/client";
import { catmatMaterial } from "../../kernel/db/schemas/catmat-material";
import { catserService } from "../../kernel/db/schemas/catser-service";
import { Embedder } from "../../kernel/embed/embedder";
import { getJson } from "../../kernel/http/client";
import {
  CatmatItemPayload,
  CatserItemPayload,
  endpoints,
  flattenMateriais,
  flattenServicos,
  materialPassage,
  pageSizes,
  pageUrl,
  type CatmatMaterialFlat,
  type CatserServiceFlat,
} from "./catalog";

const maxPaginas = 5_000;

type PageState = { readonly pagina: number };

const nextState = (stop: boolean, state: PageState) =>
  Match.value(stop).pipe(
    Match.when(true, () => Option.none<PageState>()),
    Match.orElse(() => Option.some<PageState>({ pagina: state.pagina + 1 }))
  );

const reachedEnd = (state: PageState, totalPaginas: number, count: number) =>
  count === 0 || state.pagina >= totalPaginas || state.pagina >= maxPaginas;

const insertServicos = (rows: readonly CatserServiceFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.flatMap(Db, (db) =>
        db.insert(catserService).values([...rows])
      ).pipe(Effect.asVoid)
    )
  );

const insertMateriais = (rows: readonly CatmatMaterialFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const db = yield* Db;
        const embeddings = yield* embedder.embed(
          "passage",
          rows.map(materialPassage)
        );
        const values = rows.map((row, position) => ({
          ...row,
          embedding: embeddings[position],
        }));
        yield* db.insert(catmatMaterial).values(values);
      })
    )
  );

const fetchServicos = (state: PageState) =>
  getJson(
    pageUrl({
      endpoint: endpoints.catserItem,
      pagina: state.pagina,
      tamanhoPagina: pageSizes.max,
    }),
    CatserItemPayload
  ).pipe(
    Effect.flatMap((page) => {
      const stop = reachedEnd(state, page.totalPaginas, page.resultado.length);
      return insertServicos(flattenServicos(page.resultado)).pipe(
        Effect.as([[], nextState(stop, state)] as const)
      );
    })
  );

const fetchMateriais = (state: PageState) =>
  getJson(
    pageUrl({
      endpoint: endpoints.catmatItem,
      pagina: state.pagina,
      tamanhoPagina: pageSizes.max,
    }),
    CatmatItemPayload
  ).pipe(
    Effect.flatMap((page) => {
      const stop = reachedEnd(state, page.totalPaginas, page.resultado.length);
      return insertMateriais(flattenMateriais(page.resultado)).pipe(
        Effect.as([[], nextState(stop, state)] as const)
      );
    })
  );

export const indexServicos = Stream.paginate({ pagina: 1 }, fetchServicos).pipe(
  Stream.runDrain
);

export const indexMateriais = Stream.paginate(
  { pagina: 1 },
  fetchMateriais
).pipe(Stream.runDrain);
