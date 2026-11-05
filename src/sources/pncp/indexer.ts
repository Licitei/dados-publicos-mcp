import * as Arr from "effect/Array";
import { Effect, Match, Option, Stream } from "effect";
import { Db } from "../../kernel/db/client";
import { ata } from "../../kernel/db/schemas/ata";
import { contratacao } from "../../kernel/db/schemas/contratacao";
import { contrato } from "../../kernel/db/schemas/contrato";
import { Embedder } from "../../kernel/embed/embedder";
import { Http } from "../../kernel/http/client";
import {
  AtaPayload,
  ContratacaoPayload,
  ContratoPayload,
  endpoints,
  flattenAtas,
  flattenContratacoes,
  flattenContratos,
  pageSizes,
  pageUrl,
  passageAta,
  passageContratacao,
  passageContrato,
  type AtaFlat,
  type ContratacaoFlat,
  type ContratoFlat,
} from "./catalog";

const maxPaginas = 5_000;
const chunkSize = 2_000;

const chunks = <A>(items: readonly A[]) => Arr.chunksOf(items, chunkSize);

type PageState = { readonly pagina: number };

const nextState = (stop: boolean, state: PageState) =>
  Match.value(stop).pipe(
    Match.when(true, () => Option.none<PageState>()),
    Match.orElse(() => Option.some<PageState>({ pagina: state.pagina + 1 }))
  );

const reachedEnd = (
  state: PageState,
  totalPaginas: number,
  paginasRestantes: number | undefined,
  count: number
) =>
  count === 0 ||
  paginasRestantes === 0 ||
  state.pagina >= totalPaginas ||
  state.pagina >= maxPaginas;

const insertContratacoes = (rows: readonly ContratacaoFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const db = yield* Db;
        const embeddings = yield* embedder.embed(
          "passage",
          Arr.map(rows, passageContratacao)
        );
        const values = Arr.map(rows, (row, position) => ({
          ...row,
          embedding: embeddings[position],
        }));
        yield* Effect.forEach(
          chunks(values),
          (batch) => db.insert(contratacao).values([...batch]),
          { concurrency: 1, discard: true }
        );
      })
    )
  );

const insertContratos = (rows: readonly ContratoFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const db = yield* Db;
        const embeddings = yield* embedder.embed(
          "passage",
          Arr.map(rows, passageContrato)
        );
        const values = Arr.map(rows, (row, position) => ({
          ...row,
          embedding: embeddings[position],
        }));
        yield* Effect.forEach(
          chunks(values),
          (batch) => db.insert(contrato).values([...batch]),
          { concurrency: 1, discard: true }
        );
      })
    )
  );

const insertAtas = (rows: readonly AtaFlat[]) =>
  Match.value(rows.length).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() =>
      Effect.gen(function* () {
        const embedder = yield* Embedder;
        const db = yield* Db;
        const embeddings = yield* embedder.embed("passage", Arr.map(rows, passageAta));
        const values = Arr.map(rows, (row, position) => ({
          ...row,
          embedding: embeddings[position],
        }));
        yield* Effect.forEach(
          chunks(values),
          (batch) => db.insert(ata).values([...batch]),
          { concurrency: 1, discard: true }
        );
      })
    )
  );

type ContratacaoSeed = {
  readonly dataInicial: string;
  readonly dataFinal: string;
  readonly codigoModalidadeContratacao: number;
};

type WindowSeed = {
  readonly dataInicial: string;
  readonly dataFinal: string;
};

const fetchContratacoes = (seed: ContratacaoSeed) => (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(pageUrl({
      endpoint: endpoints.contratacoes,
      pagina: state.pagina,
      tamanhoPagina: pageSizes.max,
      dataInicial: seed.dataInicial,
      dataFinal: seed.dataFinal,
      codigoModalidadeContratacao: seed.codigoModalidadeContratacao,
    }),
    ContratacaoPayload)
  ).pipe(
    Effect.flatMap((page) => {
      const stop = reachedEnd(
        state,
        page.totalPaginas,
        page.paginasRestantes,
        page.data.length
      );
      return insertContratacoes(flattenContratacoes(page.data)).pipe(
        Effect.as([[], nextState(stop, state)] as const)
      );
    })
  );

const fetchContratos = (seed: WindowSeed) => (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(pageUrl({
      endpoint: endpoints.contratos,
      pagina: state.pagina,
      tamanhoPagina: pageSizes.max,
      dataInicial: seed.dataInicial,
      dataFinal: seed.dataFinal,
    }),
    ContratoPayload)
  ).pipe(
    Effect.flatMap((page) => {
      const stop = reachedEnd(
        state,
        page.totalPaginas,
        page.paginasRestantes,
        page.data.length
      );
      return insertContratos(flattenContratos(page.data)).pipe(
        Effect.as([[], nextState(stop, state)] as const)
      );
    })
  );

const fetchAtas = (seed: WindowSeed) => (state: PageState) =>
  Effect.flatMap(Http, (http) =>
    http.json(pageUrl({
      endpoint: endpoints.atas,
      pagina: state.pagina,
      tamanhoPagina: pageSizes.max,
      dataInicial: seed.dataInicial,
      dataFinal: seed.dataFinal,
    }),
    AtaPayload)
  ).pipe(
    Effect.flatMap((page) => {
      const stop = reachedEnd(
        state,
        page.totalPaginas,
        page.paginasRestantes,
        page.data.length
      );
      return insertAtas(flattenAtas(page.data)).pipe(
        Effect.as([[], nextState(stop, state)] as const)
      );
    })
  );

export const indexContratacoes = (scope: {
  readonly dataInicial: string;
  readonly dataFinal: string;
  readonly modalidades: readonly number[];
}) =>
  Effect.forEach(
    scope.modalidades,
    (codigoModalidadeContratacao) =>
      Stream.paginate(
        { pagina: 1 },
        fetchContratacoes({
          dataInicial: scope.dataInicial,
          dataFinal: scope.dataFinal,
          codigoModalidadeContratacao,
        })
      ).pipe(Stream.runDrain),
    { concurrency: 2, discard: true }
  );

export const indexContratos = (scope: WindowSeed) =>
  Stream.paginate({ pagina: 1 }, fetchContratos(scope)).pipe(Stream.runDrain);

export const indexAtas = (scope: WindowSeed) =>
  Stream.paginate({ pagina: 1 }, fetchAtas(scope)).pipe(Stream.runDrain);
