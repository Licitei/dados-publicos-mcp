import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { readXlsxSheet } from "../../src/kernel/xlsx/sheet";

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

type Entry = { readonly name: string; readonly bytes: Uint8Array };

const storedZip = (entries: readonly Entry[]) => {
  const encoder = new TextEncoder();
  const local = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc32(entry.bytes), true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    return { nameBytes, header, data: entry.bytes };
  });
  const offsets = local.reduce<readonly number[]>((acc, part) => {
    const previous = acc[acc.length - 1] ?? 0;
    return [...acc, previous + part.header.length + part.data.length];
  }, [0]);
  const body = local.flatMap((part) => [part.header, part.data]);
  const localSize = offsets[offsets.length - 1];
  const central = local.map((part, index) => {
    const header = new Uint8Array(46 + part.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(10, 0, true);
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
  eocdView.setUint32(16, localSize, true);
  const total = [...body, ...central, eocd];
  const out = new Uint8Array(
    total.reduce((sum, chunk) => sum + chunk.length, 0)
  );
  total.reduce((position, chunk) => {
    out.set(chunk, position);
    return position + chunk.length;
  }, 0);
  return out;
};

const part = (name: string, xml: string): Entry => ({
  name,
  bytes: new TextEncoder().encode(xml),
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
      const rows = yield* readXlsxSheet(workbookXlsx, (name) =>
        name.startsWith("CAPAG Ano Base")
      );
      expect(rows.length).toBe(2);
      expect(rows[0][0]).toBe("3550308");
      expect(rows[0][1]).toBe("São Paulo");
      expect(rows[0][2]).toBe("SP");
      expect(rows[1][0]).toBe("0.8016");
      expect(rows[1][2]).toBe("inline cell");
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
