import { numeroBr } from "../../kernel/csv/fields";
import { DateTime, Effect, Option, Ref, Schema, Semaphore, Stream } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { Http, HttpError } from "../../kernel/http/client";
import { pageStep, type PageState } from "../../kernel/http/paging";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { toBool, toIntOrNull, toStringOrNull } from "../../kernel/schema/loose";
import { publicDocument, publicText } from "../../kernel/text/document";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { ApiPayload, ComprasError, comprasDatasets, type ComprasScope } from "./catalog";

type Dataset = (typeof comprasDatasets)[keyof typeof comprasDatasets];
const RawRow = Schema.Record(Schema.String, Schema.Unknown);
type RawRow = (typeof RawRow)["Type"];
const Params = Schema.Record(Schema.String, Schema.String);
type Params = (typeof Params)["Type"];
const Collected = Schema.Record(Schema.String, Schema.Array(RawRow));
type Collected = (typeof Collected)["Type"];
const Scalar = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null]);
const scalar = Schema.decodeUnknownOption(Scalar);
const valueOf = (value: unknown) => Option.getOrUndefined(scalar(value));
const textOf = (row: RawRow, column: string) => toStringOrNull(valueOf(row[column])) ?? "";

const normalizeRow = (dataset: Dataset, row: RawRow, id: string, url: string) =>
  Effect.gen(function* () {
    yield* Arr.some(dataset.identity, (column) => Str.isNonEmpty(textOf(row, column)))
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.PARSE" }));
    const normalized = Rec.map(dataset.table.columns, (type, column) => {
      const value = valueOf(row[column]);
      const text = toStringOrNull(value);
      return type === "BOOLEAN"
        ? text === null
          ? null
          : toBool(value)
        : type === "INTEGER" || type === "BIGINT"
          ? toIntOrNull(value)
          : type === "DOUBLE"
            ? numeroBr(text ?? "")
            : /cpf|cnpj|fornecedor_vencedor|^niFornecedor$/i.test(column)
              ? text === null
                ? null
                : publicDocument(text)
              : /nome|descricao|objeto|informacoes|titulo|razao/i.test(column)
                ? text === null
                  ? null
                  : publicText(text)
                : text;
    });
    const searchable = Arr.map(
      Arr.filter(Rec.keys(normalized), (column) =>
        /nome|descricao|objeto|informacoes|titulo|razao/i.test(column)
      ),
      (column) => textOf(normalized, column)
    );
    return { ...normalized, __id: id, __fonte: url, __busca: normalize(Arr.join(searchable, " ")) };
  });

export const loadCompras = (scope: ComprasScope) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const slots = yield* Semaphore.make(2);
    const requests = yield* Ref.make(0);
    const collected = yield* Ref.make<Collected>({});
    const start = DateTime.makeUnsafe(`${scope.mes}-01T00:00:00Z`);
    const from = DateTime.formatIsoDateUtc(start);
    const to = DateTime.formatIsoDateUtc(DateTime.endOf(start, "month"));
    const year = Number(Str.slice(0, 4)(scope.mes));
    const response = (url: string) =>
      Effect.gen(function* () {
        const count = yield* Ref.updateAndGet(requests, (total) => total + 1);
        yield* count <= 2000
          ? Effect.void
          : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }));
        return yield* http.response(url, { timeoutMs: 120000 });
      }).pipe(slots.withPermits(1));
    const append = (dataset: Dataset, rows: readonly RawRow[]) =>
      Ref.update(collected, (all) => ({
        ...all,
        [dataset.key]: [...(all[dataset.key] ?? []), ...rows],
      }));
    const queryUrl = (dataset: Dataset, params: Params) =>
      `https://dadosabertos.compras.gov.br${dataset.endpoint}?${new URLSearchParams(params).toString()}`;
    const readPage = (dataset: Dataset, params: Params, tag: string, page: number) =>
      Effect.gen(function* () {
        const url = queryUrl(dataset, params);
        const res = yield* response(url);
        const text = new TextDecoder().decode(res.bytes);
        const payload =
          res.status === 204
            ? { resultado: [], totalPaginas: 0 }
            : yield* Schema.decodeEffect(Schema.fromJsonString(ApiPayload))(text);
        const rows = yield* Effect.forEach(payload.resultado, (row, position) =>
          Schema.decodeUnknownEffect(dataset.schema)(row).pipe(
            Effect.flatMap((decoded) =>
              normalizeRow(dataset, decoded, `${dataset.key}:${tag}:${page}:${position}`, url)
            )
          )
        );
        yield* append(dataset, rows);
        return { rows, totalPaginas: payload.totalPaginas };
      });
    const jsonPages = (dataset: Dataset, params: Params, tag: string) =>
      Stream.paginate({ pagina: 1 }, (state: PageState) =>
        Effect.gen(function* () {
          yield* state.pagina <= 200
            ? Effect.void
            : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }));
          const result = yield* readPage(
            dataset,
            { ...params, pagina: String(state.pagina), tamanhoPagina: "500" },
            tag,
            state.pagina
          );
          yield* result.rows.length === 0 || result.totalPaginas >= state.pagina
            ? Effect.void
            : Effect.fail(ComprasError.make({ code: "compras.PARSE" }));
          return pageStep(state, { count: result.rows.length, totalPaginas: result.totalPaginas });
        })
      ).pipe(Stream.runDrain);
    const csvPages = (dataset: Dataset, params: Params, tag: string) =>
      Stream.paginate({ pagina: 1 }, (state: PageState) =>
        Effect.gen(function* () {
          yield* state.pagina <= 200
            ? Effect.void
            : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }));
          const url = queryUrl(dataset, {
            ...params,
            pagina: String(state.pagina),
            ...(dataset.key === "pca" ? { tamanhoPagina: "500" } : {}),
          });
          const res = yield* response(url);
          const text = new TextDecoder().decode(res.bytes);
          const header = Arr.head(Str.split(text, /\r\n|\r|\n/)).pipe(Option.getOrElse(() => ""));
          yield* res.status === 204 ||
          Arr.some(dataset.identity, (column) => Str.includes(column)(header))
            ? Effect.void
            : Effect.fail(ComprasError.make({ code: "compras.PARSE" }));
          const raw = res.status === 204 ? [] : parseCsvRecords(res.bytes, { delimiter: ";" });
          const rows = yield* Effect.forEach(raw, (row, position) =>
            normalizeRow(dataset, row, `${dataset.key}:${tag}:${state.pagina}:${position}`, url)
          );
          yield* append(dataset, rows);
          return pageStep(state, { count: rows.length, totalPaginas: state.pagina + 1 });
        })
      ).pipe(Stream.runDrain);
    const orgaos = Arr.dedupe(Arr.map(scope.orgaos, (orgao) => String(Number(orgao))));
    yield* Effect.forEach(
      orgaos,
      (orgao) =>
        Effect.forEach(
          ["true", "false"],
          (statusOrgao) =>
            csvPages(
              comprasDatasets.orgao,
              { codigoOrgao: orgao, statusOrgao },
              `${orgao}:${statusOrgao}`
            ),
          { concurrency: 1 }
        ),
      { concurrency: 2 }
    );
    const orgRows = (yield* Ref.get(collected)).orgao ?? [];
    yield* Arr.every(orgRows, (row) => orgaos.includes(textOf(row, "codigoOrgao")))
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.PARSE" }));
    const orgCnpjs = Arr.filter(
      Arr.dedupe(Arr.map(orgRows, (row) => onlyDigits(textOf(row, "cnpjCpfOrgao")))),
      (cnpj) => cnpj.length === 14
    );
    yield* Arr.isReadonlyArrayNonEmpty(orgRows)
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.SCOPE" }));
    const unitFilters: readonly Params[] =
      scope.uasgs === undefined
        ? Arr.map(orgCnpjs, (cnpjCpfOrgao) => ({ cnpjCpfOrgao }))
        : Arr.map(Arr.dedupe(scope.uasgs), (codigoUasg) => ({ codigoUasg }));
    yield* Arr.isReadonlyArrayNonEmpty(unitFilters)
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.SCOPE" }));
    yield* Effect.forEach(
      unitFilters,
      (filter) =>
        Effect.forEach(
          ["true", "false"],
          (statusUasg) =>
            csvPages(
              comprasDatasets.uasg,
              { ...filter, statusUasg },
              `${Arr.join(Rec.values(filter), ":")}:${statusUasg}`
            ),
          { concurrency: 1 }
        ),
      { concurrency: 2 }
    );
    const unitRows = (yield* Ref.get(collected)).uasg ?? [];
    const units = Arr.dedupe(
      Arr.map(
        Arr.filter(
          unitRows,
          (row) =>
            orgaos.includes(textOf(row, "codigoOrgao")) &&
            (scope.uasgs === undefined || scope.uasgs.includes(textOf(row, "codigoUasg")))
        ),
        (row) => textOf(row, "codigoUasg")
      )
    );
    yield* units.length > 0 && units.length <= 50
      ? Effect.void
      : Effect.fail(
          ComprasError.make({ code: units.length === 0 ? "compras.SCOPE" : "compras.LIMIT" })
        );
    yield* Effect.forEach(
      units,
      (uasg) =>
        Effect.gen(function* () {
          yield* jsonPages(
            comprasDatasets.licitacao,
            { uasg, data_publicacao_inicial: from, data_publicacao_final: to },
            uasg
          );
          yield* jsonPages(
            comprasDatasets.pregao,
            { co_uasg: uasg, dt_data_edital_inicial: from, dt_data_edital_final: to },
            uasg
          );
          yield* jsonPages(
            comprasDatasets.pregao_item,
            { co_uasg: uasg, dt_hom_inicial: from, dt_hom_final: to },
            uasg
          );
          yield* jsonPages(
            comprasDatasets.arp,
            {
              codigoUnidadeGerenciadora: uasg,
              dataVigenciaInicialMin: from,
              dataVigenciaInicialMax: to,
            },
            uasg
          );
          yield* jsonPages(
            comprasDatasets.arp_item,
            {
              codigoUnidadeGerenciadora: uasg,
              dataVigenciaInicialMin: from,
              dataVigenciaInicialMax: to,
            },
            uasg
          );
        }),
      { concurrency: 2 }
    );
    const afterUnits = yield* Ref.get(collected);
    const purchases = Arr.dedupe(
      Arr.map(afterUnits.licitacao ?? [], (row) => textOf(row, "id_compra"))
    );
    yield* purchases.length <= 5000
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }));
    yield* Effect.forEach(
      purchases,
      (id_compra) =>
        readPage(comprasDatasets.licitacao_item, { id_compra }, id_compra, 1).pipe(
          Effect.flatMap((page) =>
            page.totalPaginas <= 1
              ? Effect.void
              : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }))
          )
        ),
      { concurrency: 2 }
    );
    yield* Effect.forEach(
      orgaos,
      (orgao) =>
        Effect.gen(function* () {
          yield* jsonPages(
            comprasDatasets.contrato,
            { codigoOrgao: orgao, dataVigenciaInicialMin: from, dataVigenciaInicialMax: to },
            orgao
          );
          yield* jsonPages(
            comprasDatasets.contrato_item,
            { codigoOrgao: orgao, dataVigenciaInicialMin: from, dataVigenciaInicialMax: to },
            orgao
          );
          yield* csvPages(comprasDatasets.pca, { orgao, anoPcaProjetoCompra: String(year) }, orgao);
        }),
      { concurrency: 2 }
    );
    yield* Effect.forEach(
      orgCnpjs,
      (orgaoEntidadeCnpj) =>
        jsonPages(
          comprasDatasets.resultado,
          { orgaoEntidadeCnpj, dataResultadoPncpInicial: from, dataResultadoPncpFinal: to },
          orgaoEntidadeCnpj
        ),
      { concurrency: 2 }
    );
    const all = yield* Ref.get(collected);
    const suppliers = Arr.filter(
      Arr.dedupe(
        Arr.flatMap(Rec.values(all), (rows) =>
          Arr.map(rows, (row) =>
            onlyDigits(
              textOf(row, "niFornecedor") ||
                textOf(row, "cnpj_fornecedor") ||
                textOf(row, "fornecedor_vencedor")
            )
          )
        )
      ),
      (cnpj) => cnpj.length === 14
    );
    yield* suppliers.length <= 1000
      ? Effect.void
      : Effect.fail(ComprasError.make({ code: "compras.LIMIT" }));
    yield* Effect.forEach(
      suppliers,
      (cnpj) =>
        Effect.forEach(
          ["true", "false"],
          (ativo) => jsonPages(comprasDatasets.fornecedor, { cnpj, ativo }, `${cnpj}:${ativo}`),
          { concurrency: 1 }
        ),
      { concurrency: 2 }
    );
    const final = yield* Ref.get(collected);
    return Arr.map(Rec.values(comprasDatasets), (dataset) => ({
      table: dataset.table,
      rows: final[dataset.key] ?? [],
    }));
  }).pipe(
    Effect.mapError((cause) =>
      Schema.is(ComprasError)(cause)
        ? cause
        : ComprasError.make({
            code: Schema.is(HttpError)(cause) ? "compras.DOWNLOAD" : "compras.PARSE",
          })
    )
  );
