import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize } from "../../kernel/text/normalize";

export const endpoints = {
  catmatItem:
    "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial",
  catserItem:
    "https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico",
} as const;

export const pageSizes = { min: 10, max: 500 } as const;

export const pageUrl = (opts: {
  readonly endpoint: string;
  readonly pagina: number;
  readonly tamanhoPagina: number;
}) => {
  const tamanho = Math.min(
    Math.max(opts.tamanhoPagina, pageSizes.min),
    pageSizes.max
  );
  const params = new URLSearchParams({
    pagina: String(opts.pagina),
    tamanhoPagina: String(tamanho),
  });
  return `${opts.endpoint}?${params.toString()}`;
};

const looseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite]))
);
const looseString = Schema.optional(Schema.NullOr(Schema.String));
const looseFlag = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]))
);

export const CatmatItemRaw = Schema.Struct({
  codigoItem: looseText,
  codigoGrupo: looseText,
  nomeGrupo: looseString,
  codigoClasse: looseText,
  nomeClasse: looseString,
  codigoPdm: looseText,
  nomePdm: looseString,
  descricaoItem: looseString,
  codigo_ncm: looseString,
  descricao_ncm: looseString,
  statusItem: looseFlag,
});
export type CatmatItemRaw = (typeof CatmatItemRaw)["Type"];

export const CatserItemRaw = Schema.Struct({
  codigoServico: looseText,
  nomeServico: looseString,
  codigoSecao: looseText,
  nomeSecao: looseString,
  codigoDivisao: looseText,
  nomeDivisao: looseString,
  codigoGrupo: looseText,
  nomeGrupo: looseString,
  codigoClasse: looseText,
  nomeClasse: looseString,
  codigoSubclasse: looseText,
  nomeSubclasse: looseString,
  statusServico: looseFlag,
});
export type CatserItemRaw = (typeof CatserItemRaw)["Type"];

export const CatmatItemPayload = Schema.Struct({
  resultado: Schema.Array(CatmatItemRaw),
  totalPaginas: Schema.Finite,
});

export const CatserItemPayload = Schema.Struct({
  resultado: Schema.Array(CatserItemRaw),
  totalPaginas: Schema.Finite,
});

export const CatmatMaterialFlat = Schema.Struct({
  codigoItem: Schema.Finite,
  codigoGrupo: Schema.NullOr(Schema.Finite),
  nomeGrupo: Schema.NullOr(Schema.String),
  codigoClasse: Schema.NullOr(Schema.Finite),
  nomeClasse: Schema.NullOr(Schema.String),
  codigoPdm: Schema.NullOr(Schema.Finite),
  nomePdm: Schema.NullOr(Schema.String),
  descricaoItem: Schema.NullOr(Schema.String),
  codigoNcm: Schema.NullOr(Schema.String),
  descricaoNcm: Schema.NullOr(Schema.String),
  statusItem: Schema.Boolean,
  busca: Schema.String,
});
export type CatmatMaterialFlat = (typeof CatmatMaterialFlat)["Type"];

export const CatserServiceFlat = Schema.Struct({
  codigoServico: Schema.Finite,
  nomeServico: Schema.NullOr(Schema.String),
  codigoSecao: Schema.NullOr(Schema.Finite),
  nomeSecao: Schema.NullOr(Schema.String),
  codigoDivisao: Schema.NullOr(Schema.Finite),
  nomeDivisao: Schema.NullOr(Schema.String),
  codigoGrupo: Schema.NullOr(Schema.Finite),
  nomeGrupo: Schema.NullOr(Schema.String),
  codigoClasse: Schema.NullOr(Schema.Finite),
  nomeClasse: Schema.NullOr(Schema.String),
  codigoSubclasse: Schema.NullOr(Schema.Finite),
  nomeSubclasse: Schema.NullOr(Schema.String),
  statusServico: Schema.Boolean,
  busca: Schema.String,
});
export type CatserServiceFlat = (typeof CatserServiceFlat)["Type"];

export const CatmatCatserErrorCode = Schema.Literals([
  "catmat.NOT_FOUND",
  "catmat.LEVEL_UNRECOGNIZED",
]);
export type CatmatCatserErrorCode = (typeof CatmatCatserErrorCode)["Type"];

export class CatmatCatserError extends Schema.TaggedError<CatmatCatserError, { readonly brand: unique symbol }>()(
  "CatmatCatserError",
  {
    code: CatmatCatserErrorCode,
    codigo: Schema.optional(Schema.String),
    nivel: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "catmat.NOT_FOUND":
        return `Codigo CATMAT/CATSER nao encontrado: ${this.codigo}.`;
      case "catmat.LEVEL_UNRECOGNIZED":
        return `Nivel de hierarquia CATMAT/CATSER nao reconhecido: ${this.nivel}.`;
    }
  }
}

type Loose = string | number | boolean | null | undefined;

const toStringOrNull = (value: Loose) => {
  const text = value === null || value === undefined ? "" : Str.trim(String(value));
  return text === "" ? null : text;
};

const toIntOrNull = (value: Loose) => {
  const text = toStringOrNull(value);
  const parsed = text === null ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toBool = (value: Loose) =>
  typeof value === "boolean"
    ? value
    : typeof value === "string"
      ? pipe(value, Str.trim, Str.toLowerCase) === "true"
      : Boolean(value);

const cleanText = (value: string) =>
  pipe(value, Str.replace(/\s+/g, " "), Str.trim);

const joinText = (parts: readonly Loose[]) =>
  pipe(
    parts,
    Arr.map(toStringOrNull),
    Arr.filter((part) => part !== null),
    Arr.join(" ")
  );

const flattenMaterial = (raw: CatmatItemRaw) => {
  const codigoItem = toIntOrNull(raw.codigoItem);
  return codigoItem === null
    ? []
    : [
        {
          codigoItem,
          codigoGrupo: toIntOrNull(raw.codigoGrupo),
          nomeGrupo: toStringOrNull(raw.nomeGrupo),
          codigoClasse: toIntOrNull(raw.codigoClasse),
          nomeClasse: toStringOrNull(raw.nomeClasse),
          codigoPdm: toIntOrNull(raw.codigoPdm),
          nomePdm: toStringOrNull(raw.nomePdm),
          descricaoItem: toStringOrNull(raw.descricaoItem),
          codigoNcm: toStringOrNull(raw.codigo_ncm),
          descricaoNcm: toStringOrNull(raw.descricao_ncm),
          statusItem: toBool(raw.statusItem),
          busca: normalize(
            joinText([
              raw.descricaoItem,
              raw.nomePdm,
              raw.nomeClasse,
              raw.nomeGrupo,
              raw.descricao_ncm,
            ])
          ),
        } satisfies CatmatMaterialFlat,
      ];
};

export const flattenMateriais = (resultado: readonly CatmatItemRaw[]) =>
  Arr.flatMap(resultado, flattenMaterial);

const flattenServico = (raw: CatserItemRaw) => {
  const codigoServico = toIntOrNull(raw.codigoServico);
  return codigoServico === null
    ? []
    : [
        {
          codigoServico,
          nomeServico: toStringOrNull(raw.nomeServico),
          codigoSecao: toIntOrNull(raw.codigoSecao),
          nomeSecao: toStringOrNull(raw.nomeSecao),
          codigoDivisao: toIntOrNull(raw.codigoDivisao),
          nomeDivisao: toStringOrNull(raw.nomeDivisao),
          codigoGrupo: toIntOrNull(raw.codigoGrupo),
          nomeGrupo: toStringOrNull(raw.nomeGrupo),
          codigoClasse: toIntOrNull(raw.codigoClasse),
          nomeClasse: toStringOrNull(raw.nomeClasse),
          codigoSubclasse: toIntOrNull(raw.codigoSubclasse),
          nomeSubclasse: toStringOrNull(raw.nomeSubclasse),
          statusServico: toBool(raw.statusServico),
          busca: normalize(
            joinText([
              raw.nomeServico,
              raw.nomeSubclasse,
              raw.nomeClasse,
              raw.nomeGrupo,
              raw.nomeDivisao,
              raw.nomeSecao,
            ])
          ),
        } satisfies CatserServiceFlat,
      ];
};

export const flattenServicos = (resultado: readonly CatserItemRaw[]) =>
  Arr.flatMap(resultado, flattenServico);

export const materialPassage = (row: CatmatMaterialFlat) =>
  cleanText(joinText([row.descricaoItem, row.nomePdm, row.nomeClasse]));
