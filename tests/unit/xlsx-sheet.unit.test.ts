import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { readXlsxSheet } from "../../src/kernel/xlsx/sheet";
import { storedZip, utf8, type ZipEntry } from "./support/stored-zip";

const cell = (rows: readonly (readonly string[])[], row: number, col: number) =>
  Arr.get(rows, row).pipe(
    Option.flatMap((r) => Arr.get(r, col)),
    Option.getOrElse(() => "")
  );

const part = (name: string, xml: string): ZipEntry => ({
  name,
  bytes: utf8(xml),
});

const workbookXlsx = storedZip([
  part(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook><sheets><sheet name="CAPAG Ano Base 2024" sheetId="1" r:id="rId1"/></sheets></workbook>`
  ),
  part(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  ),
  part(
    "xl/sharedStrings.xml",
    `<?xml version="1.0"?><sst><si><t>São Paulo</t></si><si><t>SP</t></si></sst>`
  ),
  part(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>3550308</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>0.8016</v></c><c r="C2" t="inlineStr"><is><t>inline cell</t></is></c></row></sheetData></worksheet>`
  ),
]);

describe("kernel/xlsx readXlsxSheet", () => {
  it.effect("reads rows by position resolving shared and inline strings", () =>
    Effect.gen(function* () {
      const rows = yield* readXlsxSheet(
        workbookXlsx,
        Str.startsWith("CAPAG Ano Base")
      );
      expect(rows.length).toBe(2);
      expect(cell(rows, 0, 0)).toBe("3550308");
      expect(cell(rows, 0, 1)).toBe("São Paulo");
      expect(cell(rows, 0, 2)).toBe("SP");
      expect(cell(rows, 1, 0)).toBe("0.8016");
      expect(cell(rows, 1, 2)).toBe("inline cell");
    })
  );

  it.effect("fails with XlsxError when the sheet matcher finds nothing", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        readXlsxSheet(workbookXlsx, (name) => name === "missing")
      );
      expect(error._tag).toBe("XlsxError");
      expect(error.code).toBe("xlsx.SHEET_NOT_FOUND");
    })
  );
});
