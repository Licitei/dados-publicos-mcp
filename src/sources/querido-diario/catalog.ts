import { Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { dataBr } from "../../kernel/csv/fields";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { decodeXmlEntities } from "../../kernel/text/xml";

const DATA_BASE = "https://data.queridodiario.ok.org.br";

export const defaultScope = [{ uf: "AP", ano: 2025 }] as const;

export const aggregateZipUrl: {
  (ano: number): (uf: string) => string;
  (uf: string, ano: number): string;
} = dual(2, (uf: string, ano: number) => {
  const upper = pipe(uf, Str.toUpperCase);
  return `${DATA_BASE}/aggregates/${upper}/${upper}_${ano}.zip`;
});

export const acceptXml = (name: string) => /\.xml$/i.test(name);

const DiarioFlat = Schema.Struct({
  territoryId: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  ano: Schema.NullOr(Schema.Finite),
  data: Schema.NullOr(Schema.String),
  poder: Schema.NullOr(Schema.String),
  edicao: Schema.NullOr(Schema.String),
  edicaoExtra: Schema.NullOr(Schema.String),
  urlOriginal: Schema.NullOr(Schema.String),
  conteudo: Schema.String,
  busca: Schema.String,
});
export type DiarioFlat = (typeof DiarioFlat)["Type"];

const decodeXmlText = (raw: string) =>
  pipe(raw, Str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"), decodeXmlEntities);

const tagRegex = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");

const tagContent = (xml: string, tag: string) =>
  pipe(xml, Str.match(tagRegex(tag)), Option.flatMap(Arr.get(1)));

const extractTag: {
  (tag: string): (xml: string) => string | null;
  (xml: string, tag: string): string | null;
} = dual(2, (xml: string, tag: string) =>
  pipe(
    tagContent(xml, tag),
    Option.map((raw) => pipe(decodeXmlText(raw), Str.trim)),
    Option.getOrNull
  )
);

const extractRawBlock: {
  (tag: string): (xml: string) => string | null;
  (xml: string, tag: string): string | null;
} = dual(2, (xml: string, tag: string) => pipe(tagContent(xml, tag), Option.getOrNull));

const diarioBlockRegex = /<diario\b[^>]*>([\s\S]*?)<\/diario>/gi;

const cnpjRegex = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;

const parseAno = (value: string | null) => {
  const parsed = value === null || value === "" ? Number.NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildData = (value: string | null) => dataBr(pipe(value ?? "", Str.trim, Str.slice(0, 10)));

const parseMeta = (xml: string) => {
  const metaBlock = extractRawBlock(xml, "meta") ?? "";
  return {
    uf: pipe(extractTag(metaBlock, "uf") ?? "", Str.toUpperCase),
    ano: parseAno(extractTag(metaBlock, "ano_publicacao")),
    municipio: extractTag(metaBlock, "municipio") ?? "",
    territoryId: onlyDigits(extractTag(metaBlock, "municipio_codigo_ibge") ?? ""),
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

export const excerpt: {
  (limit: number): (conteudo: string) => string;
  (conteudo: string, limit: number): string;
} = dual(2, (conteudo: string, limit: number) =>
  conteudo.length > limit ? `${pipe(conteudo, Str.slice(0, limit))}...` : conteudo
);

const QueridoDiarioErrorCode = Schema.Literals(["querido-diario.MISSING_TERMO"]);

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
