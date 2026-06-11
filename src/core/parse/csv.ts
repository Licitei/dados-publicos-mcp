export type CsvOptions = {
  delimiter?: string;
  hasHeader?: boolean;
  encoding?: string;
};

const defaultOptions: Required<CsvOptions> = {
  delimiter: ";",
  hasHeader: false,
  encoding: "utf-8",
};

/**
 * Decodifica bytes (ou string) para texto, respeitando o encoding informado
 * (ex.: "iso-8859-1", "windows-1252", "utf-8") via TextDecoder, e remove BOM.
 */
function decode(
  bytes: Uint8Array | ArrayBuffer | string,
  encoding: string,
): string {
  if (typeof bytes === "string") return stripBom(bytes);

  // ArrayBuffer.isView e true para TypedArray (Uint8Array) e false para
  // ArrayBuffer puro; discriminacao de tipo sem checagem de classe runtime.
  const view = ArrayBuffer.isView(bytes) ? bytes : new Uint8Array(bytes);
  const text = new TextDecoder(encoding, { fatal: false }).decode(view);

  return stripBom(text);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Faz o parse de um CSV em uma matriz de strings.
 * Respeita aspas duplas (com escape ""), CRLF/CR/LF e BOM.
 * Decodifica o encoding informado (default utf-8).
 */
export function parseCsv(
  bytes: Uint8Array | ArrayBuffer | string,
  opts?: CsvOptions,
): string[][] {
  const options = { ...defaultOptions, ...opts };
  const text = decode(bytes, options.encoding);
  const delimiter = options.delimiter;
  const rows: string[][] = [];

  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let started = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    started = true;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;

      continue;
    }

    if (char === delimiter) {
      pushField();

      continue;
    }

    if (char === "\r") {
      // Trata CRLF e CR como uma unica quebra.
      if (text[i + 1] === "\n") i++;

      pushRow();

      continue;
    }

    if (char === "\n") {
      pushRow();

      continue;
    }

    field += char;
  }

  // Ultima linha sem quebra final.
  if (started || field !== "" || row.length > 0) {
    pushField();
    rows.push(row);
  }

  return options.hasHeader && rows.length > 0 ? rows.slice(1) : rows;
}

/**
 * Parse de CSV para uma lista de objetos chave->valor.
 * Usa a primeira linha como cabecalho (ou headerOverride quando fornecido,
 * caso em que NENHUMA linha do CSV e tratada como cabecalho).
 */
export function parseCsvObjects(
  bytes: Uint8Array | ArrayBuffer | string,
  headerOverride?: string[],
  opts?: CsvOptions,
): Record<string, string>[] {
  const useOverride = headerOverride !== undefined;
  const rows = parseCsv(bytes, {
    ...opts,
    hasHeader: useOverride ? false : true,
  });

  // No modo override o cabecalho e o informado; senao, reparseia sem remover
  // a primeira linha (parseCsv com hasHeader:true ja a removeu de `rows`).
  const header = useOverride
    ? headerOverride
    : (parseCsv(bytes, { ...opts, hasHeader: false })[0] ?? []);

  return rows.map((cells) => {
    const record: Record<string, string> = {};

    for (let i = 0; i < header.length; i++) {
      record[header[i]] = cells[i] ?? "";
    }

    return record;
  });
}
