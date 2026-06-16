const stripBom = (text: string) =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mergeQuotedLines = (lines: readonly string[]) => {
  const merged: string[] = [];
  const trailing = lines.reduce<string | null>((pending, line) => {
    const combined = pending === null ? line : `${pending}\n${line}`;
    const balanced = (combined.match(/"/g) ?? []).length % 2 === 0;
    return balanced ? (merged.push(combined), null) : combined;
  }, null);
  return trailing === null ? merged : (merged.push(trailing), merged);
};

const unquote = (cell: string) =>
  cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')
    ? cell.slice(1, -1).replace(/""/g, '"')
    : cell;

const tokenize = (line: string, pattern: RegExp, delimiter: string) =>
  Array.from((delimiter + line).matchAll(pattern), (match) => unquote(match[1]));

export type CsvOptions = {
  readonly encoding?: string;
  readonly delimiter?: string;
};

export const parseCsvRecords = (
  bytes: Uint8Array,
  options?: CsvOptions
): readonly Record<string, string>[] => {
  const encoding = options?.encoding ?? "utf-8";
  const delimiter = options?.delimiter ?? ",";
  const text = stripBom(new TextDecoder(encoding, { fatal: false }).decode(bytes));
  const escaped = escapeRegExp(delimiter);
  const pattern = new RegExp(
    `${escaped}("(?:[^"]*(?:""[^"]*)*)"|[^${escaped}]*)`,
    "g"
  );
  const rows = mergeQuotedLines(text.split(/\r\n|\r|\n/))
    .filter((line) => line.length > 0)
    .map((line) => tokenize(line, pattern, delimiter));
  const header = rows[0] ?? [];
  return rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))
    );
};
