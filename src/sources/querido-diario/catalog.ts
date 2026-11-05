import { Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const API_BASE = "https://api.queridodiario.ok.org.br";
export const DATA_BASE = "https://data.queridodiario.ok.org.br";

export const defaultScope = [{ uf: "AP", ano: 2025 }] as const;

export const passageHeadLimit = 1_200;

export const aggregatesUrl = (uf: string) =>
  `${API_BASE}/aggregates/${pipe(uf, Str.toUpperCase)}`;

export const aggregateZipUrl: {
  (ano: number): (uf: string) => string;
  (uf: string, ano: number): string;
} = dual(2, (uf: string, ano: number) => {
  const upper = pipe(uf, Str.toUpperCase);
  return `${DATA_BASE}/aggregates/${upper}/${upper}_${ano}.zip`;
});

export const acceptXml = (name: string) => /\.xml$/i.test(name);

export const AggregateInfo = Schema.Struct({
  territory_id: Schema.optional(Schema.String),
  state_code: Schema.optional(Schema.String),
  file_path: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Finite),
  last_updated: Schema.optional(Schema.String),
  hash_info: Schema.optional(Schema.String),
  file_size_mb: Schema.optional(Schema.Finite),
});

export const AggregatesResponse = Schema.Struct({
  aggregates: Schema.optional(Schema.Array(AggregateInfo)),
});
export type AggregatesResponse = (typeof AggregatesResponse)["Type"];

export type DiarioFlat = {
  readonly territoryId: string;
  readonly uf: string;
  readonly municipio: string;
  readonly ano: number | null;
  readonly data: string | null;
  readonly poder: string | null;
  readonly edicao: string | null;
  readonly edicaoExtra: string | null;
  readonly urlOriginal: string | null;
  readonly conteudo: string;
  readonly busca: string;
};

const decodeNumericEntities = (pattern: RegExp, radix: number) => (raw: string) =>
  pipe(
    raw,
    Str.matchAll(pattern),
    Arr.fromIterable,
    Arr.reduce(raw, (acc, found) =>
      pipe(
        Arr.get(found, 1),
        Option.map((digits) =>
          pipe(
            acc,
            Str.replaceAll(
              found[0],
              String.fromCodePoint(Number.parseInt(digits, radix))
            )
          )
        ),
        Option.getOrElse(() => acc)
      )
    )
  );

export const decodeXmlText = (raw: string) =>
  pipe(
    raw,
    Str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
    Str.replace(/&lt;/g, "<"),
    Str.replace(/&gt;/g, ">"),
    Str.replace(/&quot;/g, '"'),
    Str.replace(/&apos;/g, "'"),
    decodeNumericEntities(/&#(\d+);/g, 10),
    decodeNumericEntities(/&#x([0-9a-fA-F]+);/g, 16),
    Str.replace(/&amp;/g, "&")
  );

const tagRegex = (tag: string) =>
  new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");

const tagContent = (xml: string, tag: string) =>
  pipe(xml, Str.match(tagRegex(tag)), Option.flatMap(Arr.get(1)));

export const extractTag: {
  (tag: string): (xml: string) => string | null;
  (xml: string, tag: string): string | null;
} = dual(2, (xml: string, tag: string) =>
  pipe(
    tagContent(xml, tag),
    Option.map((raw) => pipe(decodeXmlText(raw), Str.trim)),
    Option.getOrNull
  )
);

export const extractRawBlock: {
  (tag: string): (xml: string) => string | null;
  (xml: string, tag: string): string | null;
} = dual(2, (xml: string, tag: string) =>
  pipe(tagContent(xml, tag), Option.getOrNull)
);

const diarioBlockRegex = /<diario\b[^>]*>([\s\S]*?)<\/diario>/gi;

const cnpjRegex = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;

const parseAno = (value: string | null) => {
  const parsed =
    value === null || value === "" ? Number.NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const threeGroups = (found: RegExpMatchArray) =>
  Option.all([Arr.get(found, 1), Arr.get(found, 2), Arr.get(found, 3)]);

const pad2 = (value: string) => pipe(value, Str.padStart(2, "0"));

const buildData = (value: string | null) => {
  const trimmed = pipe(value ?? "", Str.trim);
  return pipe(
    trimmed,
    Str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/),
    Option.flatMap(threeGroups),
    Option.map(([day, month, year]) => `${year}-${pad2(month)}-${pad2(day)}`),
    Option.orElse(() =>
      pipe(
        trimmed,
        Str.match(/^(\d{4})-(\d{2})-(\d{2})/),
        Option.flatMap(threeGroups),
        Option.map(([year, month, day]) => `${year}-${month}-${day}`)
      )
    ),
    Option.getOrNull
  );
};

const parseMeta = (xml: string) => {
  const metaBlock = extractRawBlock(xml, "meta") ?? "";
  return {
    uf: pipe(extractTag(metaBlock, "uf") ?? "", Str.toUpperCase),
    ano: parseAno(extractTag(metaBlock, "ano_publicacao")),
    municipio: extractTag(metaBlock, "municipio") ?? "",
    territoryId: onlyDigits(
      extractTag(metaBlock, "municipio_codigo_ibge") ?? ""
    ),
  };
};

export const parseMunicipioXml = (xml: string): readonly DiarioFlat[] => {
  const meta = parseMeta(xml);
  return pipe(
    xml,
    Str.matchAll(diarioBlockRegex),
    Arr.fromIterable,
    Arr.flatMap((match) =>
      pipe(
        Arr.get(match, 1),
        Option.map((bloco): DiarioFlat => {
          const metaDiario = extractRawBlock(bloco, "meta_diario") ?? bloco;
          const conteudo = extractTag(bloco, "conteudo") ?? "";
          return {
            territoryId: meta.territoryId,
            uf: meta.uf,
            municipio: meta.municipio,
            ano: meta.ano,
            data: buildData(extractTag(metaDiario, "data_publicacao")),
            poder: extractTag(metaDiario, "poder"),
            edicao: extractTag(metaDiario, "numero_edicao"),
            edicaoExtra: extractTag(metaDiario, "edicao_extra"),
            urlOriginal: extractTag(metaDiario, "url_arquivo_original"),
            conteudo,
            busca: normalize(conteudo),
          };
        }),
        Option.toArray
      )
    )
  );
};

export const extractCnpjs = (texto: string): readonly string[] =>
  pipe(
    texto,
    Str.matchAll(cnpjRegex),
    Arr.fromIterable,
    Arr.map((match) => onlyDigits(match[0])),
    Arr.filter((digits) => digits.length === 14),
    Arr.dedupe
  );

export const passageDiario = (row: DiarioFlat) =>
  pipe(
    `${row.municipio} ${row.data ?? ""} ${pipe(row.conteudo, Str.slice(0, passageHeadLimit))}`,
    Str.trim
  );

export const excerpt: {
  (limit: number): (conteudo: string) => string;
  (conteudo: string, limit: number): string;
} = dual(2, (conteudo: string, limit: number) =>
  conteudo.length > limit
    ? `${pipe(conteudo, Str.slice(0, limit))}...`
    : conteudo
);

export const QueridoDiarioErrorCode = Schema.Literals([
  "querido-diario.MISSING_TERMO",
]);
export type QueridoDiarioErrorCode = (typeof QueridoDiarioErrorCode)["Type"];

export class QueridoDiarioError extends Schema.TaggedError<
  QueridoDiarioError,
  { readonly brand: unique symbol }
>()("QueridoDiarioError", {
  code: QueridoDiarioErrorCode,
}) {
  override get message() {
    switch (this.code) {
      case "querido-diario.MISSING_TERMO":
        return "Informe um termo de busca para pesquisar nos diarios oficiais.";
    }
  }
}
