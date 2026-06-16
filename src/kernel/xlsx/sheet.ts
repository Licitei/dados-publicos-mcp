import { Effect, Match, Schema } from "effect";
import { unzipEntries, ZipError } from "../zip/archive";

const XlsxErrorCode = Schema.Literals([
  "xlsx.WORKBOOK_MISSING",
  "xlsx.SHEET_NOT_FOUND",
  "xlsx.REL_MISSING",
  "xlsx.WORKSHEET_MISSING",
]);
export type XlsxErrorCode = (typeof XlsxErrorCode)["Type"];

export class XlsxError extends Schema.TaggedErrorClass<XlsxError>()("XlsxError", {
  code: XlsxErrorCode,
  rid: Schema.optional(Schema.String),
  available: Schema.optional(Schema.Array(Schema.String)),
}) {
  override get message() {
    switch (this.code) {
      case "xlsx.WORKBOOK_MISSING":
        return "XLSX invalido: xl/workbook.xml ausente.";
      case "xlsx.SHEET_NOT_FOUND":
        return `XLSX: aba nao encontrada. Disponiveis: ${(this.available ?? []).join(", ")}.`;
      case "xlsx.REL_MISSING":
        return `XLSX: relacao ${this.rid} nao mapeia para um worksheet.`;
      case "xlsx.WORKSHEET_MISSING":
        return "XLSX: worksheet referenciada ausente no pacote.";
    }
  }
}

export type SheetMatcher = (name: string) => boolean;

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const attr = (attrs: string, name: string) => {
  const match = attrs.match(
    new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*"([^"]*)"`)
  );
  return match ? match[1] : null;
};

const colLetterToIndex = (letters: string) =>
  [...letters.toUpperCase()].reduce(
    (acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64),
    0
  ) - 1;

const textOf = (bytes: Uint8Array | undefined) =>
  bytes === undefined ? "" : new TextDecoder("utf-8").decode(bytes);

const normalizeEntryName = (name: string) => name.replace(/^\/+/, "");

type SheetRef = { readonly name: string; readonly rid: string };

const parseWorkbookSheets = (xml: string): readonly SheetRef[] =>
  [...xml.matchAll(/<sheet\b([^>]*)\/?>/g)].flatMap((match) => {
    const attrs = match[1];
    const name = attr(attrs, "name");
    const rid = attr(attrs, "r:id") ?? attr(attrs, "id");
    return name === null || rid === null
      ? []
      : [{ name: decodeXmlEntities(name), rid }];
  });

const resolveSheetPath = (relsXml: string, rid: string) =>
  [...relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .flatMap((match) => {
      const attrs = match[1];
      const target = attr(attrs, "Target");
      return attr(attrs, "Id") === rid && target !== null
        ? [target.replace(/^\/?xl\//, "").replace(/^\/+/, "")]
        : [];
    })
    .at(0);

const parseSharedStrings = (xml: string): readonly string[] =>
  [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlEntities(part[1]))
      .join("")
  );

const decodeCellValue = (
  type: string | null,
  body: string,
  shared: readonly string[]
) =>
  Match.value(type).pipe(
    Match.when("inlineStr", () =>
      [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((part) => decodeXmlEntities(part[1]))
        .join("")
    ),
    Match.when("s", () => {
      const index = Number((body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) ?? ["", ""])[1]);
      return Number.isInteger(index) ? shared[index] ?? "" : "";
    }),
    Match.orElse(() =>
      decodeXmlEntities((body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) ?? ["", ""])[1])
    )
  );

const parseRow = (rowXml: string, shared: readonly string[]): readonly string[] => {
  const cells = [...rowXml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(
    (match, position) => {
      const ref = attr(match[1], "r");
      return {
        index: ref ? colLetterToIndex(ref.replace(/\d+/g, "")) : position,
        value: decodeCellValue(attr(match[1], "t"), match[2] ?? "", shared),
      };
    }
  );
  const width = cells.reduce((max, cell) => Math.max(max, cell.index + 1), 0);
  const byIndex = new Map(cells.map((cell) => [cell.index, cell.value]));
  return Array.from({ length: width }, (_, index) => byIndex.get(index) ?? "");
};

const parseWorksheet = (
  xml: string,
  shared: readonly string[]
): readonly (readonly string[])[] =>
  [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((match) =>
    parseRow(match[1], shared)
  );

export const readXlsxSheet = (
  bytes: Uint8Array,
  matchSheet: SheetMatcher
): Effect.Effect<readonly (readonly string[])[], XlsxError | ZipError> =>
  Effect.gen(function* () {
    const entries = yield* unzipEntries(bytes, (name) =>
      normalizeEntryName(name).startsWith("xl/")
    );
    const byName = new Map(
      entries.map((entry) => [normalizeEntryName(entry.name), entry.data])
    );
    const workbook = textOf(byName.get("xl/workbook.xml"));
    yield* Match.value(workbook).pipe(
      Match.when("", () =>
        Effect.fail(new XlsxError({ code: "xlsx.WORKBOOK_MISSING" }))
      ),
      Match.orElse(() => Effect.void)
    );
    const sheets = parseWorkbookSheets(workbook);
    const target = sheets.find((sheet) => matchSheet(sheet.name));
    return yield* Match.value(target).pipe(
      Match.when(Match.undefined, () =>
        Effect.fail(
          new XlsxError({
            code: "xlsx.SHEET_NOT_FOUND",
            available: sheets.map((sheet) => sheet.name),
          })
        )
      ),
      Match.orElse((found) =>
        Match.value(
          resolveSheetPath(textOf(byName.get("xl/_rels/workbook.xml.rels")), found.rid)
        ).pipe(
          Match.when(Match.undefined, () =>
            Effect.fail(new XlsxError({ code: "xlsx.REL_MISSING", rid: found.rid }))
          ),
          Match.orElse((path) =>
            Match.value(textOf(byName.get(`xl/${path}`))).pipe(
              Match.when("", () =>
                Effect.fail(new XlsxError({ code: "xlsx.WORKSHEET_MISSING" }))
              ),
              Match.orElse((sheetXml) =>
                Effect.succeed(
                  parseWorksheet(
                    sheetXml,
                    parseSharedStrings(textOf(byName.get("xl/sharedStrings.xml")))
                  )
                )
              )
            )
          )
        )
      )
    );
  });
