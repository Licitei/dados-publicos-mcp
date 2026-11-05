import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { Http, HttpError } from "../../kernel/http/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { unzipEntries } from "../../kernel/zip/archive";
import { IbamaRow, IbamaError, ibamaRow, ibamaUrl, type IbamaDataset } from "./catalog";

export const loadIbama = (dataset: IbamaDataset) =>
  Effect.gen(function* () {
    const http = yield* Http;
    const bytes = yield* http.bytes(ibamaUrl(dataset), { timeoutMs: 180000 });
    const entries = yield* unzipEntries(bytes, (name) => /\.csv$/i.test(name));
    const raw = Arr.flatMap(entries, (entry) =>
      parseCsvRecords(entry.data, { delimiter: ";", encoding: "utf-8" })
    );
    yield* Arr.isReadonlyArrayNonEmpty(raw)
      ? Effect.void
      : Effect.fail(IbamaError.make({ code: "ibama.EMPTY" }));
    const batches = yield* Effect.forEach(raw, (row) => {
      const mapped = ibamaRow({ dataset, row });
      return mapped.cancelado === true
        ? Effect.succeed([])
        : Schema.decodeEffect(IbamaRow)(mapped).pipe(Effect.map((decoded) => [decoded]));
    });
    return Arr.flatten(batches);
  }).pipe(
    Effect.mapError((cause) =>
      Schema.is(IbamaError)(cause)
        ? cause
        : IbamaError.make({
            code: Schema.is(HttpError)(cause) ? "ibama.DOWNLOAD" : "ibama.PARSE",
            cause: String(cause),
          })
    )
  );
