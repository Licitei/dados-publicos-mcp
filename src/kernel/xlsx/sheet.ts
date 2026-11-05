import { Effect, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import { decodeXmlEntities, group, matchesOf } from "../text/xml";
import { unzipEntries, type ZipError } from "../zip/archive";

const XlsxErrorCode = Schema.Literals([
  "xlsx.WORKBOOK_MISSING",
  "xlsx.SHEET_NOT_FOUND",
  "xlsx.REL_MISSING",
  "xlsx.WORKSHEET_MISSING",
]);
type XlsxErrorCode = (typeof XlsxErrorCode)["Type"];

export class XlsxError extends Schema.TaggedError<XlsxError, { readonly brand: unique symbol }>()(
  "XlsxError",
  {
    code: XlsxErrorCode,
    rid: Schema.optional(Schema.String),
    available: Schema.optional(Schema.Array(Schema.String)),
  }
) {
  override get message() {
    switch (this.code) {
      case "xlsx.WORKBOOK_MISSING":
        return "XLSX invalido: xl/workbook.xml ausente.";
      case "xlsx.SHEET_NOT_FOUND":
        return `XLSX: aba nao encontrada. Disponiveis: ${pipe(this.available ?? [], Arr.join(", "))}.`;
      case "xlsx.REL_MISSING":
        return `XLSX: relacao ${this.rid} nao mapeia para um worksheet.`;
      case "xlsx.WORKSHEET_MISSING":
        return "XLSX: worksheet referenciada ausente no pacote.";
    }
  }
}

export type SheetMatcher = (name: string) => boolean;

const escapeRegExp = (value: string) => pipe(value, Str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const attr = (attrs: string, name: string) =>
  pipe(
    attrs,
    Str.match(new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*"([^"]*)"`)),
    Option.flatMap((match) => Arr.get(match, 1)),
    Option.flatMap(Option.fromNullishOr)
  );

const colLetterToIndex = (letters: string) =>
  pipe(
    letters,
    Str.toUpperCase,
    Arr.fromIterable,
    Arr.reduce(
      0,
      (acc, ch) =>
        acc * 26 +
        (pipe(
          Str.charCodeAt(ch, 0),
          Option.getOrElse(() => 64)
        ) -
          64)
    )
  ) - 1;

const textOf = (bytes: Uint8Array | undefined) =>
  bytes === undefined ? "" : new TextDecoder("utf-8").decode(bytes);

const normalizeEntryName = (name: string) => pipe(name, Str.replace(/^\/+/, ""));

const SheetRef = Schema.Struct({ name: Schema.String, rid: Schema.String });
type SheetRef = (typeof SheetRef)["Type"];

const parseWorkbookSheets = (xml: string): readonly SheetRef[] =>
  pipe(
    xml,
    matchesOf(/<sheet\b([^>]*)\/?>/g),
    Arr.flatMap((match) => {
      const attrs = group(match, 1);
      return pipe(
        Option.all({
          name: attr(attrs, "name"),
          rid: Option.orElse(attr(attrs, "r:id"), () => attr(attrs, "id")),
        }),
        Option.map(({ name, rid }): SheetRef => ({ name: decodeXmlEntities(name), rid })),
        Option.toArray
      );
    })
  );

const resolveSheetPath = (relsXml: string, rid: string) =>
  pipe(
    relsXml,
    matchesOf(/<Relationship\b([^>]*)\/?>/g),
    Arr.findFirst((match) => {
      const attrs = group(match, 1);
      return pipe(
        attr(attrs, "Target"),
        Option.filter(() => Option.exists(attr(attrs, "Id"), (id) => id === rid)),
        Option.map((target) => pipe(target, Str.replace(/^\/?xl\//, ""), Str.replace(/^\/+/, "")))
      );
    })
  );

const textParts = (body: string) =>
  pipe(
    body,
    matchesOf(/<t\b[^>]*>([\s\S]*?)<\/t>/g),
    Arr.map((part) => decodeXmlEntities(group(part, 1))),
    Arr.join("")
  );

const parseSharedStrings = (xml: string): readonly string[] =>
  pipe(
    xml,
    matchesOf(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
    Arr.map((match) => textParts(group(match, 1)))
  );

const valueOf = (body: string) =>
  pipe(
    body,
    Str.match(/<v\b[^>]*>([\s\S]*?)<\/v>/),
    Option.map((match) => group(match, 1)),
    Option.getOrElse(() => "")
  );

const decodeCellValue = (type: string, body: string, shared: readonly string[]) =>
  Match.value(type).pipe(
    Match.when("inlineStr", () => textParts(body)),
    Match.when("s", () => {
      const index = Number(valueOf(body));
      return Number.isInteger(index)
        ? pipe(
            Arr.get(shared, index),
            Option.getOrElse(() => "")
          )
        : "";
    }),
    Match.orElse(() => decodeXmlEntities(valueOf(body)))
  );

const parseRow = (rowXml: string, shared: readonly string[]): readonly string[] => {
  const cells = pipe(
    rowXml,
    matchesOf(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g),
    Arr.map((match, position) => {
      const attrs = group(match, 1);
      return {
        index: pipe(
          attr(attrs, "r"),
          Option.match({
            onNone: () => position,
            onSome: (ref) => colLetterToIndex(pipe(ref, Str.replace(/\d+/g, ""))),
          })
        ),
        value: decodeCellValue(
          pipe(
            attr(attrs, "t"),
            Option.getOrElse(() => "")
          ),
          group(match, 2),
          shared
        ),
      };
    })
  );
  const width = pipe(
    cells,
    Arr.reduce(0, (max, cell) => Math.max(max, cell.index + 1))
  );
  const byIndex = new Map(
    pipe(
      cells,
      Arr.map((cell): readonly [number, string] => [cell.index, cell.value])
    )
  );
  return Arr.makeBy(width, (index) =>
    pipe(
      Option.fromNullishOr(byIndex.get(index)),
      Option.getOrElse(() => "")
    )
  );
};

const parseWorksheet = (xml: string, shared: readonly string[]): readonly (readonly string[])[] =>
  pipe(
    xml,
    matchesOf(/<row\b[^>]*>([\s\S]*?)<\/row>/g),
    Arr.map((match) => parseRow(group(match, 1), shared))
  );

const readXlsxSheetImpl = (
  bytes: Uint8Array,
  matchSheet: SheetMatcher
): Effect.Effect<readonly (readonly string[])[], XlsxError | ZipError> =>
  Effect.gen(function* () {
    const entries = yield* unzipEntries(bytes, (name) =>
      pipe(normalizeEntryName(name), Str.startsWith("xl/"))
    );
    const byName = new Map(
      pipe(
        entries,
        Arr.map((entry): readonly [string, Uint8Array] => [
          normalizeEntryName(entry.name),
          entry.data,
        ])
      )
    );
    const workbook = textOf(byName.get("xl/workbook.xml"));
    yield* Match.value(workbook).pipe(
      Match.when("", () => Effect.fail(XlsxError.make({ code: "xlsx.WORKBOOK_MISSING" }))),
      Match.orElse(() => Effect.void)
    );
    const sheets = parseWorkbookSheets(workbook);
    const found = yield* pipe(
      Effect.fromOption(Arr.findFirst(sheets, (sheet) => matchSheet(sheet.name))),
      Effect.mapError(() =>
        XlsxError.make({
          code: "xlsx.SHEET_NOT_FOUND",
          available: Arr.map(sheets, (sheet) => sheet.name),
        })
      )
    );
    const path = yield* pipe(
      Effect.fromOption(
        resolveSheetPath(textOf(byName.get("xl/_rels/workbook.xml.rels")), found.rid)
      ),
      Effect.mapError(() => XlsxError.make({ code: "xlsx.REL_MISSING", rid: found.rid }))
    );
    const sheetXml = textOf(byName.get(`xl/${path}`));
    yield* Match.value(sheetXml).pipe(
      Match.when("", () => Effect.fail(XlsxError.make({ code: "xlsx.WORKSHEET_MISSING" }))),
      Match.orElse(() => Effect.void)
    );
    return parseWorksheet(sheetXml, parseSharedStrings(textOf(byName.get("xl/sharedStrings.xml"))));
  });

export const readXlsxSheet: {
  (
    matchSheet: SheetMatcher
  ): (bytes: Uint8Array) => Effect.Effect<readonly (readonly string[])[], XlsxError | ZipError>;
  (
    bytes: Uint8Array,
    matchSheet: SheetMatcher
  ): Effect.Effect<readonly (readonly string[])[], XlsxError | ZipError>;
} = dual(2, readXlsxSheetImpl);
