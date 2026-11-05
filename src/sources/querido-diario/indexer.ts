import { Effect } from "effect";
import * as Arr from "effect/Array";
import { dual } from "effect/Function";
import { TextDecoder } from "node:util";
import { Http } from "../../kernel/http/client";
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
  Effect.flatMap(Http, (http) =>
    http.bytes(url, { headers: { accept: "application/zip" } })
  );

export const listAggregates = (uf: string) =>
  Effect.flatMap(Http, (http) =>
    http.json(aggregatesUrl(uf), AggregatesResponse)
  ).pipe(
    Effect.map((response) => response.aggregates ?? [])
  );

const loadDiariosEffect = (uf: string, ano: number) =>
  Effect.gen(function* () {
    const bytes = yield* downloadZip(aggregateZipUrl(uf, ano));
    const entries = yield* unzipEntries(bytes, acceptXml);
    return Arr.flatMap(entries, (entry): readonly DiarioFlat[] =>
      parseMunicipioXml(decoder.decode(entry.data))
    );
  });

export const loadDiarios: {
  (ano: number): (uf: string) => ReturnType<typeof loadDiariosEffect>;
  (uf: string, ano: number): ReturnType<typeof loadDiariosEffect>;
} = dual(2, loadDiariosEffect);
