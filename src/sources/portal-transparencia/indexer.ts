import { DateTime, Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Http, HttpError } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import { parseCsvRecords } from "../../kernel/csv/parse";
import {
  PortalError,
  type PortalSnapshot,
  portalRow,
  type PortalDataset,
  type PortalRequest,
} from "./catalog";

const monthsAgo = (now: DateTime.Utc, offset: number) => {
  const total =
    DateTime.getPartUtc(now, "year") * 12 + DateTime.getPartUtc(now, "month") - 1 - offset;
  return `${Math.floor(total / 12)}${Str.padStart(2, "0")(String((total % 12) + 1))}`;
};

const snapshot = (
  dataset: PortalDataset,
  periods: readonly string[]
): Effect.Effect<(typeof PortalSnapshot)["Type"], HttpError | PortalError, Http> =>
  Effect.gen(function* () {
    const period = yield* Effect.fromOption(Arr.head(periods)).pipe(
      Effect.mapError(() => PortalError.make({ code: "portal.MISSING", dataset }))
    );
    const http = yield* Http;
    const url = `https://portaldatransparencia.gov.br/download-de-dados/${dataset}/${period}`;
    return yield* http.head(url).pipe(
      Effect.andThen(http.bytes(url, { timeoutMs: 180000 })),
      Effect.map((bytes) => ({ periodo: period, bytes, url })),
      Effect.catchTag("HttpError", (error) =>
        error.code === "http.STATUS" && error.status === 404
          ? snapshot(dataset, Arr.drop(periods, 1))
          : Effect.fail(error)
      )
    );
  });

export const loadPortal = (request: (typeof PortalRequest)["Type"]) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const candidates = Option.fromNullishOr(request.mes).pipe(
      Option.match({
        onNone: () =>
          request.dataset === "emendas-parlamentares"
            ? Arr.makeBy(3, (offset) => String(DateTime.getPartUtc(now, "year") - offset))
            : Arr.makeBy(6, (offset) => monthsAgo(now, offset)),
        onSome: (mes) => [
          request.dataset === "emendas-parlamentares"
            ? Str.slice(0, 4)(mes)
            : Str.replace("-", "")(mes),
        ],
      })
    );
    const found = yield* snapshot(request.dataset, candidates);
    const entries = yield* unzipEntries(
      found.bytes,
      (name) => /\.csv$/i.test(name) && (request.dataset !== "servidores" || /cadastro/i.test(name))
    );
    const batches = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.forEach(
          parseCsvRecords(entry.data, { delimiter: ";", encoding: "latin1" }),
          (row, position) =>
            portalRow({
              dataset: request.dataset,
              row,
              file: entry.name,
              position,
              periodo: found.periodo,
              url: found.url,
            })
        ),
      { concurrency: 1 }
    );
    const rows = Arr.flatten(batches);
    return yield* Arr.isReadonlyArrayNonEmpty(rows)
      ? Effect.succeed(rows)
      : Effect.fail(PortalError.make({ code: "portal.EMPTY", dataset: request.dataset }));
  }).pipe(
    Effect.mapError((cause) =>
      Schema.is(PortalError)(cause)
        ? cause
        : PortalError.make({
            code: Schema.is(HttpError)(cause)
              ? cause.status === 403
                ? "portal.BLOCKED"
                : "portal.DOWNLOAD"
              : "portal.PARSE",
            dataset: request.dataset,
            cause: String(cause),
          })
    )
  );
