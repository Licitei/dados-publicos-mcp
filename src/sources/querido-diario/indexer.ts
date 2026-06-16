import { Effect } from "effect";
import { TextDecoder } from "node:util";
import { getJson, httpResponse } from "../../kernel/http/client";
import { unzipEntries } from "../../kernel/zip/archive";
import {
  acceptXml,
  aggregatesUrl,
  aggregateZipUrl,
  AggregatesResponse,
  parseMunicipioXml,
  type DiarioFlat,
} from "./catalog";

const decoder = new TextDecoder("utf-8", { fatal: false });

const downloadZip = (url: string) =>
  httpResponse(url, { headers: { accept: "application/zip" } }).pipe(
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.map((buffer) => new Uint8Array(buffer))
  );

export const listAggregates = (uf: string) =>
  getJson(aggregatesUrl(uf), AggregatesResponse).pipe(
    Effect.map((response) => response.aggregates ?? [])
  );

export const loadDiarios = (uf: string, ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(aggregateZipUrl(uf, ano));
    const entries = yield* unzipEntries(bytes, acceptXml);
    return entries.flatMap((entry): readonly DiarioFlat[] =>
      parseMunicipioXml(decoder.decode(entry.data))
    );
  });
