import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import { Sinapi, SinapiLive } from "../../src/sources/sinapi/store";

const crcTable = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>(
    (c) => ((c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1),
    n
  )
);

const crc32 = (bytes: Uint8Array) =>
  (bytes.reduce(
    (crc, byte) => (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff],
    0xffffffff
  ) ^
    0xffffffff) >>>
  0;

type ZipEntry = { readonly name: string; readonly bytes: Uint8Array };

const storedZip = (entries: readonly ZipEntry[]) => {
  const encoder = new TextEncoder();
  const local = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(entry.bytes), true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    return { nameBytes, header, data: entry.bytes };
  });
  const offsets = local.reduce<readonly number[]>(
    (acc, part) => [
      ...acc,
      (acc[acc.length - 1] ?? 0) + part.header.length + part.data.length,
    ],
    [0]
  );
  const central = local.map((part, index) => {
    const header = new Uint8Array(46 + part.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(16, crc32(part.data), true);
    view.setUint32(20, part.data.length, true);
    view.setUint32(24, part.data.length, true);
    view.setUint16(28, part.nameBytes.length, true);
    view.setUint32(42, offsets[index], true);
    header.set(part.nameBytes, 46);
    return header;
  });
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offsets[offsets.length - 1], true);
  const chunks = [
    ...local.flatMap((part) => [part.header, part.data]),
    ...central,
    eocd,
  ];
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  chunks.reduce((position, chunk) => {
    out.set(chunk, position);
    return position + chunk.length;
  }, 0);
  return out;
};

const colLetter = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : `${colLetter(Math.floor(index / 26) - 1)}${colLetter(index % 26)}`;

const cell = (rowNumber: number, index: number, value: string) =>
  /^-?\d+(\.\d+)?$/.test(value)
    ? `<c r="${colLetter(index)}${rowNumber}"><v>${value}</v></c>`
    : `<c r="${colLetter(index)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`;

const sheetRow = (
  rowNumber: number,
  values: readonly (readonly [number, string])[]
) =>
  `<row r="${rowNumber}">${values
    .map(([index, value]) => cell(rowNumber, index, value))
    .join("")}</row>`;

const header = [
  "Classificacao",
  "Codigo do Insumo",
  "Descricao do Insumo",
  "Unidade",
  "Origem de Preco",
  "AC",
  "AL",
  "SP",
].map((value, index): readonly [number, string] => [index, value]);

const xlsx = storedZip([
  {
    name: "xl/workbook.xml",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><workbook><sheets><sheet name="ISD" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
  },
  {
    name: "xl/worksheets/sheet1.xml",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><worksheet><sheetData>${[
        sheetRow(1, [[0, "SINAPI - Precos Medianos (R$)"]]),
        sheetRow(2, [[0, "Data de emissao: 12/06/2026 (SEM DESONERACAO)"]]),
        sheetRow(3, header),
        sheetRow(4, [
          [0, "MATERIAL"],
          [1, "11270"],
          [2, "ABRACADEIRA DE LATAO"],
          [3, "UN"],
          [4, "CR"],
          [6, "2.53"],
          [7, "3.10"],
        ]),
        sheetRow(5, [
          [0, "SERVICOS"],
          [1, "45333"],
          [2, "ABERTURA PARA ENCAIXE DE CUBA EM BANCADA"],
          [3, "UN"],
          [4, "CR"],
          [5, "302.08"],
          [6, "195.46"],
          [7, "250.00"],
        ]),
      ].join("")}</sheetData></worksheet>`
    ),
  },
]);

const outerZip = storedZip([
  { name: "SINAPI_Referencia_2026_05.xlsx", bytes: xlsx },
]);

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("SINAPI-2026-05-formato-xlsx.zip")
    ? new Response(outerZip)
    : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  SinapiLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const sinapi = yield* Sinapi;
  yield* sinapi.indexReferencia(2026, 5);
  return sinapi;
});

describe("sinapi store + zip/xlsx unpivot", () => {
  it.effect(
    "unpivots the ISD sheet UF columns into long rows, skipping blanks",
    () =>
      Effect.gen(function* () {
        const sinapi = yield* Sinapi;
        const result = yield* sinapi.indexReferencia(2026, 5);
        expect(result.inserted).toBe(5);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "precoPorCodigo returns per-UF median prices; blank UF was skipped",
    () =>
      Effect.gen(function* () {
        const sinapi = yield* seeded;
        const todos = yield* sinapi.precoPorCodigo("11270", undefined);
        expect(todos.map((r) => r.uf).sort()).toEqual(["AL", "SP"]);
        const al = yield* sinapi.precoPorCodigo("11270", "AL");
        expect(al).toHaveLength(1);
        expect(Number(al[0].precoMediano)).toBeCloseTo(2.53, 2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarInsumo matches by description (bm25) and honors the uf filter",
    () =>
      Effect.gen(function* () {
        const sinapi = yield* seeded;
        const hits = yield* sinapi.buscarInsumo("abracadeira latao", {
          uf: "SP",
        });
        expect(hits).toHaveLength(1);
        expect(hits[0].codigo).toBe("11270");
        expect(Number(hits[0].precoMediano)).toBeCloseTo(3.1, 2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
