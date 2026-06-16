import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { parseCsvRecords } from "../../src/kernel/csv/parse";
import { unzipEntries } from "../../src/kernel/zip/archive";

const rec = (text: string) =>
  parseCsvRecords(new TextEncoder().encode(text), { delimiter: ";" });

describe("kernel/csv parse", () => {
  it("keeps a leading unquoted-empty field aligned", () => {
    expect(rec("A;B;C\n;x;y")).toEqual([{ A: "", B: "x", C: "y" }]);
  });

  it("preserves mid and trailing empty fields", () => {
    expect(rec("A;B;C\na;;")).toEqual([{ A: "a", B: "", C: "" }]);
  });

  it("reassembles a quoted field spanning physical lines", () => {
    expect(rec('A;B\n"x\ny";z')).toEqual([{ A: "x\ny", B: "z" }]);
  });

  it("unescapes doubled quotes and keeps embedded delimiters", () => {
    expect(rec('A;B\n"a""b";"c;d"')).toEqual([{ A: 'a"b', B: "c;d" }]);
  });

  it("decodes the configured encoding", () => {
    const bytes = new Uint8Array(Buffer.from('NOME\n"JOÃO"', "latin1"));
    expect(parseCsvRecords(bytes, { encoding: "iso-8859-1", delimiter: ";" })).toEqual(
      [{ NOME: "JOÃO" }]
    );
  });
});

describe("kernel/zip archive", () => {
  it.effect("fails with a typed ZipError when there is no EOCD", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        unzipEntries(new Uint8Array(40), () => true)
      );
      expect(error._tag).toBe("ZipError");
      expect(error.code).toBe("zip.MALFORMED");
    })
  );

  it.effect(
    "fails (not a defect) when the central directory is out of bounds",
    () =>
      Effect.gen(function* () {
        const bytes = new Uint8Array(22);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(10, 1, true);
        view.setUint32(16, 1000, true);
        const error = yield* Effect.flip(unzipEntries(bytes, () => true));
        expect(error._tag).toBe("ZipError");
        expect(error.code).toBe("zip.MALFORMED");
      })
  );
});
