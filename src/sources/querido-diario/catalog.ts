import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const API_BASE = "https://api.queridodiario.ok.org.br";
export const DATA_BASE = "https://data.queridodiario.ok.org.br";

export const defaultScope = [{ uf: "AP", ano: 2025 }] as const;

export const passageHeadLimit = 1_200;

export const aggregatesUrl = (uf: string) =>
  `${API_BASE}/aggregates/${uf.toUpperCase()}`;

export const aggregateZipUrl = (uf: string, ano: number) =>
  `${DATA_BASE}/aggregates/${uf.toUpperCase()}/${uf.toUpperCase()}_${ano}.zip`;

export const acceptXml = (name: string) => /\.xml$/i.test(name);

export const AggregateInfo = Schema.Struct({
  territory_id: Schema.optional(Schema.String),
  state_code: Schema.optional(Schema.String),
  file_path: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Number),
  last_updated: Schema.optional(Schema.String),
  hash_info: Schema.optional(Schema.String),
  file_size_mb: Schema.optional(Schema.Number),
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

export const decodeXmlText = (raw: string) =>
  raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&");

const tagRegex = (tag: string) =>
  new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");

export const extractTag = (xml: string, tag: string) => {
  const match = xml.match(tagRegex(tag));
  return match ? decodeXmlText(match[1]).trim() : null;
};

export const extractRawBlock = (xml: string, tag: string) => {
  const match = xml.match(tagRegex(tag));
  return match ? match[1] : null;
};

const diarioBlockRegex = /<diario\b[^>]*>([\s\S]*?)<\/diario>/gi;

const cnpjRegex = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;

const parseAno = (value: string | null) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const buildData = (value: string | null) => {
  const trimmed = (value ?? "").trim();
  const slashed = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return slashed
    ? `${slashed[3]}-${slashed[2].padStart(2, "0")}-${slashed[1].padStart(2, "0")}`
    : iso
      ? `${iso[1]}-${iso[2]}-${iso[3]}`
      : null;
};

const parseMeta = (xml: string) => {
  const metaBlock = extractRawBlock(xml, "meta") ?? "";
  return {
    uf: (extractTag(metaBlock, "uf") ?? "").toUpperCase(),
    ano: parseAno(extractTag(metaBlock, "ano_publicacao")),
    municipio: extractTag(metaBlock, "municipio") ?? "",
    territoryId: onlyDigits(
      extractTag(metaBlock, "municipio_codigo_ibge") ?? ""
    ),
  };
};

export const parseMunicipioXml = (xml: string): readonly DiarioFlat[] => {
  const meta = parseMeta(xml);
  return Array.from(xml.matchAll(diarioBlockRegex), (match) => {
    const bloco = match[1];
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
    } satisfies DiarioFlat;
  });
};

export const extractCnpjs = (texto: string): readonly string[] => [
  ...new Set(
    Array.from(texto.matchAll(cnpjRegex), (match) => onlyDigits(match[0])).filter(
      (digits) => digits.length === 14
    )
  ),
];

export const passageDiario = (row: DiarioFlat) =>
  `${row.municipio} ${row.data ?? ""} ${row.conteudo.slice(0, passageHeadLimit)}`.trim();

export const excerpt = (conteudo: string, limit: number) =>
  conteudo.length > limit ? `${conteudo.slice(0, limit)}...` : conteudo;

export const QueridoDiarioErrorCode = Schema.Literals([
  "querido-diario.MISSING_TERMO",
]);
export type QueridoDiarioErrorCode = (typeof QueridoDiarioErrorCode)["Type"];

export class QueridoDiarioError extends Schema.TaggedErrorClass<QueridoDiarioError>()(
  "QueridoDiarioError",
  {
    code: QueridoDiarioErrorCode,
  }
) {
  override get message() {
    switch (this.code) {
      case "querido-diario.MISSING_TERMO":
        return "Informe um termo de busca para pesquisar nos diarios oficiais.";
    }
  }
}
