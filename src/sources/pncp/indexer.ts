import { Duck } from "../../kernel/duck/duck";
import * as Arr from "effect/Array";
import { Effect, Schema, Stream } from "effect";
import { appendRows } from "../../kernel/duck/append";
import { Http } from "../../kernel/http/client";
import { pageStep, type PageState } from "../../kernel/http/paging";
import {
  pncpItemTable,
  pncpInstrumentoTable,
  ItemParent,
  ItensPayload,
  InstrumentoPayload,
  flattenItens,
  flattenInstrumentos,
  itensUrl,
  PncpError,
  ataTable,
  AtaPayload,
  contratacaoTable,
  contratoFornecedorTable,
  contratoTable,
  ContratacaoPayload,
  ContratoPayload,
  endpoints,
  flattenAtas,
  flattenContratacoes,
  flattenContratos,
  pageSizes,
  pageUrl,
} from "./catalog";

const WindowSeed = Schema.Struct({
  dataInicial: Schema.String,
  dataFinal: Schema.String,
});
type WindowSeed = (typeof WindowSeed)["Type"];

const PageEnvelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
  totalPaginas: Schema.Finite,
  paginasRestantes: Schema.optional(Schema.Finite),
});

const windowFetcher =
  <S extends Schema.Top & { readonly Type: (typeof PageEnvelope)["Type"] }, E, R>(
    endpoint: string,
    payload: S,
    store: (page: S["Type"]) => Effect.Effect<void, E, R>
  ) =>
  <Seed extends WindowSeed>(seed: Seed) =>
  (state: PageState) =>
    Effect.flatMap(Http, (http) =>
      http.json(
        pageUrl({ endpoint, pagina: state.pagina, tamanhoPagina: pageSizes.max, ...seed }),
        payload
      )
    ).pipe(
      Effect.flatMap((page) =>
        store(page).pipe(
          Effect.as(
            pageStep(state, {
              count: page.paginasRestantes === 0 ? 0 : page.data.length,
              totalPaginas: page.totalPaginas,
            })
          )
        )
      )
    );

const fetchContratacoes = windowFetcher(endpoints.contratacoes, ContratacaoPayload, (page) =>
  appendRows(contratacaoTable, flattenContratacoes(page.data))
);

const fetchContratos = windowFetcher(endpoints.contratos, ContratoPayload, (page) => {
  const rows = flattenContratos(page.data);
  return appendRows(contratoTable, rows).pipe(
    Effect.andThen(
      appendRows(
        contratoFornecedorTable,
        Arr.map(rows, (row) => ({
          numeroControlePNCP: row.numeroControlePNCP,
          buscaFornecedor: row.buscaFornecedor,
        }))
      )
    )
  );
});

const fetchAtas = windowFetcher(endpoints.atas, AtaPayload, (page) =>
  appendRows(ataTable, flattenAtas(page.data))
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

const fetchInstrumentos = (scope: WindowSeed) => (state: PageState) =>
  Effect.gen(function* () {
    yield* state.pagina <= 200 ? Effect.void : Effect.fail(PncpError.make({ code: "pncp.LIMIT" }));
    const http = yield* Http;
    const response = yield* http.response(
      pageUrl({
        endpoint: endpoints.instrumentos,
        pagina: state.pagina,
        tamanhoPagina: 100,
        ...scope,
      })
    );
    const page =
      response.status === 204
        ? { data: [], totalPaginas: 0, paginasRestantes: 0 }
        : yield* Schema.decodeEffect(Schema.fromJsonString(InstrumentoPayload))(
            new TextDecoder().decode(response.bytes)
          ).pipe(Effect.mapError(() => PncpError.make({ code: "pncp.PARSE" })));
    yield* appendRows(pncpInstrumentoTable, flattenInstrumentos(page.data));
    return pageStep(state, {
      count: page.paginasRestantes === 0 ? 0 : page.data.length,
      totalPaginas: page.totalPaginas,
    });
  });
export const indexInstrumentos = (scope: WindowSeed) =>
  Stream.paginate({ pagina: 1 }, fetchInstrumentos(scope)).pipe(Stream.runDrain);

export const indexItens = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const compras = yield* duck.query(
    ItemParent,
    'SELECT "numeroControlePNCP", "orgaoCnpj", "anoCompra", "sequencialCompra" FROM contratacao'
  );
  yield* compras.length <= 10000
    ? Effect.void
    : Effect.fail(PncpError.make({ code: "pncp.LIMIT" }));
  yield* Effect.forEach(
    compras,
    (compra) =>
      Stream.paginate({ pagina: 1 }, (state: PageState) =>
        Effect.gen(function* () {
          yield* state.pagina <= 200
            ? Effect.void
            : Effect.fail(PncpError.make({ code: "pncp.LIMIT" }));
          const url = `${itensUrl(compra)}?pagina=${state.pagina}&tamanhoPagina=100`;
          const response = yield* http.response(url);
          const raw =
            response.status === 204
              ? []
              : yield* Schema.decodeEffect(Schema.fromJsonString(ItensPayload))(
                  new TextDecoder().decode(response.bytes)
                ).pipe(Effect.mapError(() => PncpError.make({ code: "pncp.PARSE" })));
          yield* raw.length <= 100
            ? Effect.void
            : Effect.fail(PncpError.make({ code: "pncp.PARSE" }));
          yield* appendRows(pncpItemTable, flattenItens({ compra, itens: raw }));
          return pageStep(state, {
            count: raw.length === 100 ? raw.length : 0,
            totalPaginas: state.pagina + 1,
          });
        })
      ).pipe(Stream.runDrain),
    { concurrency: 2, discard: true }
  );
});
