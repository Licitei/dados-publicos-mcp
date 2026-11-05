import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { CmedAnvisa, CmedAnvisaLive } from "../../src/sources/cmed-anvisa/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const colLetter = (index: number): string =>
  Option.getOrElse(Arr.get(Arr.fromIterable(letters), index), () => "A");

const cell = (rowNumber: number, index: number, value: string) =>
  /^-?\d+(\.\d+)?$/.test(value)
    ? `<c r="${colLetter(index)}${rowNumber}"><v>${value}</v></c>`
    : `<c r="${colLetter(index)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`;

const sheetRow = (rowNumber: number, values: readonly string[]) =>
  `<row r="${rowNumber}">${Arr.join(
    Arr.map(values, (value, index) => cell(rowNumber, index, value)),
    ""
  )}</row>`;

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
    bytes: utf8(
      `<?xml version="1.0"?><workbook><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    bytes: utf8(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
  },
  {
    name: "xl/worksheets/sheet1.xml",
    bytes: utf8(
      `<?xml version="1.0"?><worksheet><sheetData>${Arr.join(
        [
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
        ],
        ""
      )}</sheetData></worksheet>`
    ),
  },
]);

const pageHtml =
  '<html><body><a href="/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos/xls_conformidade_gov_20260610_121627707.xlsx/@@download/file">PMVG</a></body></html>';

const HttpFixture = fixtureLayer([
  { match: pathIncludes("@@download/file"), respond: { body: xlsx } },
  { match: pathIncludes("/cmed/precos"), respond: { body: pageHtml } },
]);

const TestLayer = CmedAnvisaLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

const seeded = Effect.gen(function* () {
  const cmed = yield* CmedAnvisa;
  yield* cmed.index;
  return cmed;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("cmed-anvisa store + xlsx ingest", (it) => {
  it.effect("scrapes the page, downloads the xlsx, detects the header row dynamically", () =>
    Effect.gen(function* () {
      const cmed = yield* CmedAnvisa;
      const result = yield* cmed.index;
      expect(result.inserted).toBe(2);
      expect(result.total).toBe(2);
    })
  );

  it.effect("buscarMedicamento matches by bm25 then fuzzy; price columns parsed", () =>
    Effect.gen(function* () {
      const cmed = yield* seeded;
      const hit = yield* cmed.buscarMedicamento("dipirona novalgina");
      expect(Option.map(Arr.head(hit), (r) => r.produto)).toEqual(Option.some("NOVALGINA"));
      expect(Option.map(Arr.head(hit), (r) => Math.round(Number(r.pfSemImpostos) * 100))).toEqual(
        Option.some(2744)
      );
      expect(Option.map(Arr.head(hit), (r) => Number(r.score) > 0)).toEqual(Option.some(true));
      const typo = yield* cmed.buscarMedicamento("novalgna");
      expect(Option.map(Arr.head(typo), (r) => r.produto)).toEqual(Option.some("NOVALGINA"));
      expect(Option.map(Arr.head(typo), (r) => r.score)).toEqual(Option.some(0));
      const outro = yield* cmed.buscarMedicamento("abatacepte orencia");
      expect(Arr.map(outro, (r) => r.produto)).toContain("ORENCIA");
      expect(
        Option.map(Arr.head(outro), (r) => Math.round(Number(r.pmvgSemImpostos) * 100))
      ).toEqual(Option.some(164646));
    })
  );

  it.effect("precoPorEan and precoPorGgrem resolve a single presentation", () =>
    Effect.gen(function* () {
      const cmed = yield* seeded;
      const ean = yield* cmed.precoPorEan("7891234567890");
      expect(ean).toHaveLength(1);
      expect(Option.map(Arr.head(ean), (r) => Math.round(Number(r.pmvgSemImpostos) * 100))).toEqual(
        Option.some(2153)
      );
      const ggrem = yield* cmed.precoPorGgrem("987654321");
      expect(Option.map(Arr.head(ggrem), (r) => r.produto)).toEqual(Option.some("ORENCIA"));
    })
  );
});
