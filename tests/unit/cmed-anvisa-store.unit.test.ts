import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { CmedAnvisa, CmedAnvisaLive } from "../../src/sources/cmed-anvisa/store";
import { TestDbLive } from "./support/test-db";

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

const sheetRow = (rowNumber: number, values: readonly string[]) =>
  `<row r="${rowNumber}">${values
    .map((value, index) => cell(rowNumber, index, value))
    .join("")}</row>`;

const header = [
  "SUBSTÂNCIA",
  "CNPJ",
  "LABORATÓRIO",
  "CÓDIGO GGREM",
  "REGISTRO",
  "EAN 1",
  "PRODUTO",
  "APRESENTAÇÃO",
  "CLASSE TERAPÊUTICA",
  "PF Sem Impostos",
  "PMVG Sem Impostos",
  "TARJA",
];

const xlsx = storedZip([
  {
    name: "xl/workbook.xml",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><workbook><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`
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
        sheetRow(1, ["Lista de Preços de Medicamentos - CMED"]),
        sheetRow(2, ["Preços a partir de 10/06/2026"]),
        sheetRow(3, header),
        sheetRow(4, [
          "DIPIRONA SODICA",
          "12.345.678/0001-99",
          "LAB ABC",
          "123456789",
          "100000001",
          "7891234567890",
          "NOVALGINA",
          "500 MG/ML SOL INJ",
          "ANALGESICOS",
          "27,44",
          "21,53",
          "Tarja Vermelha",
        ]),
        sheetRow(5, [
          "ABATACEPTE",
          "56.998.982/0001-07",
          "LAB XYZ",
          "987654321",
          "100000002",
          "7899999999999",
          "ORENCIA",
          "250 MG PO LIOF",
          "IMUNOSSUPRESSORES",
          "2098,20",
          "1646,46",
          "Tarja Vermelha",
        ]),
      ].join("")}</sheetData></worksheet>`
    ),
  },
]);

const pageHtml =
  '<html><body><a href="/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/xls_conformidade_gov_20260610_121627707.xlsx/@@download/file">PMVG</a></body></html>';

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("@@download/file")
    ? new Response(xlsx)
    : url.includes("/cmed/precos")
      ? new Response(pageHtml)
      : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  CmedAnvisaLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpStub))),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const cmed = yield* CmedAnvisa;
  yield* cmed.index;
  return cmed;
});

describe("cmed-anvisa store + xlsx ingest", () => {
  it.effect(
    "scrapes the page, downloads the xlsx, detects the header row dynamically",
    () =>
      Effect.gen(function* () {
        const cmed = yield* CmedAnvisa;
        const result = yield* cmed.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarMedicamento matches by bm25 then trgm; price columns parsed",
    () =>
      Effect.gen(function* () {
        const cmed = yield* seeded;
        const hit = yield* cmed.buscarMedicamento("dipirona novalgina");
        expect(hit[0].produto).toBe("NOVALGINA");
        expect(Number(hit[0].pfSemImpostos)).toBeCloseTo(27.44, 1);
        expect(Number(hit[0].score)).toBeLessThan(0);
        const outro = yield* cmed.buscarMedicamento("abatacepte orencia");
        expect(outro.map((r) => r.produto)).toContain("ORENCIA");
        expect(Number(outro[0].pmvgSemImpostos)).toBeCloseTo(1646.46, 0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "precoPorEan and precoPorGgrem resolve a single presentation",
    () =>
      Effect.gen(function* () {
        const cmed = yield* seeded;
        const ean = yield* cmed.precoPorEan("7891234567890");
        expect(ean).toHaveLength(1);
        expect(Number(ean[0].pmvgSemImpostos)).toBeCloseTo(21.53, 1);
        const ggrem = yield* cmed.precoPorGgrem("987654321");
        expect(ggrem[0].produto).toBe("ORENCIA");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
