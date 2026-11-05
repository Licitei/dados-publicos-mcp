import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { Sinapi, SinapiLive } from "../../src/sources/sinapi/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const colLetter = (index: number): string =>
  Str.charAt(index)(letters).pipe(Option.getOrElse(() => "A"));

const cell = (rowNumber: number, index: number, value: string) =>
  Str.isNonEmpty(value) && Number.isFinite(Number(value))
    ? `<c r="${colLetter(index)}${rowNumber}"><v>${value}</v></c>`
    : `<c r="${colLetter(index)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`;

const sheetRow = (rowNumber: number, values: readonly (readonly [number, string])[]) =>
  `<row r="${rowNumber}">${Arr.join(
    Arr.map(values, ([index, value]) => cell(rowNumber, index, value)),
    ""
  )}</row>`;

const header = Arr.map(
  [
    "Classificacao",
    "Codigo do Insumo",
    "Descricao do Insumo",
    "Unidade",
    "Origem de Preco",
    "AC",
    "AL",
    "SP",
  ],
  (value, index): readonly [number, string] => [index, value]
);

const xlsx = storedZip([
  {
    name: "xl/workbook.xml",
    bytes: utf8(
      `<?xml version="1.0"?><workbook><sheets><sheet name="ISD" sheetId="1" r:id="rId1"/></sheets></workbook>`
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
        ],
        ""
      )}</sheetData></worksheet>`
    ),
  },
]);

const outerZip = storedZip([{ name: "SINAPI_Referencia_2026_05.xlsx", bytes: xlsx }]);

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("SINAPI-2026-05-formato-xlsx.zip"),
    respond: { body: outerZip },
  },
]);

const TestLayer = SinapiLive.pipe(Layer.provideMerge(Layer.mergeAll(TestDuckLive, HttpFixture)));

const seeded = Effect.gen(function* () {
  const sinapi = yield* Sinapi;
  yield* sinapi.indexReferencia(2026, 5);
  return sinapi;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("sinapi store + zip/xlsx unpivot", (it) => {
  it.effect("unpivots the ISD sheet UF columns into long rows, skipping blanks", () =>
    Effect.gen(function* () {
      const sinapi = yield* Sinapi;
      const result = yield* sinapi.indexReferencia(2026, 5);
      expect(result.inserted).toBe(5);
    })
  );

  it.effect("precoPorCodigo returns per-UF median prices; blank UF was skipped", () =>
    Effect.gen(function* () {
      const sinapi = yield* seeded;
      const todos = yield* sinapi.precoPorCodigo("11270", undefined);
      expect(
        Arr.sort(
          Arr.map(todos, (r) => String(r.uf)),
          Order.String
        )
      ).toEqual(["AL", "SP"]);
      const al = yield* sinapi.precoPorCodigo("11270", "AL");
      expect(al).toHaveLength(1);
      expect(
        Option.exists(Arr.head(al), (r) => Math.abs(Number(r.precoMediano) - 2.53) < 0.005)
      ).toBe(true);
    })
  );

  it.effect("buscarInsumo matches by description (bm25) and honors the uf filter", () =>
    Effect.gen(function* () {
      const sinapi = yield* seeded;
      const hits = yield* sinapi.buscarInsumo("abracadeira latao", { uf: "SP" });
      expect(hits).toHaveLength(1);
      const first = Arr.head(hits);
      expect(Option.map(first, (r) => r.codigo)).toEqual(Option.some("11270"));
      expect(Option.exists(first, (r) => Math.abs(Number(r.precoMediano) - 3.1) < 0.005)).toBe(
        true
      );
    })
  );
});
