import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const consultarUrl =
  "https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor";

export const pageSizes = { min: 10, max: 500 } as const;
export const ativoFlags = [true, false] as const;

const looseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite]))
);
const looseString = Schema.optional(Schema.NullOr(Schema.String));
const looseFlag = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]))
);

export const FornecedorRaw = Schema.Struct({
  cnpj: looseText,
  cpf: looseString,
  nomeRazaoSocialFornecedor: looseString,
  ativo: looseFlag,
  habilitadoLicitar: looseFlag,
  ufSigla: looseString,
  nomeMunicipio: looseString,
  codigoCnae: looseText,
  nomeCnae: looseString,
  naturezaJuridicaNome: looseString,
  porteEmpresaNome: looseString,
});
export type FornecedorRaw = (typeof FornecedorRaw)["Type"];

export const ConsultarPayload = Schema.Struct({
  resultado: Schema.Array(FornecedorRaw),
  totalPaginas: Schema.Finite,
});
export type ConsultarPayload = (typeof ConsultarPayload)["Type"];

export const FornecedorFlat = Schema.Struct({
  cnpj: Schema.NullOr(Schema.String),
  cpf: Schema.NullOr(Schema.String),
  nomeRazaoSocial: Schema.NullOr(Schema.String),
  ativo: Schema.Boolean,
  habilitadoLicitar: Schema.Boolean,
  ufSigla: Schema.NullOr(Schema.String),
  nomeMunicipio: Schema.NullOr(Schema.String),
  nomeMunicipioNormalizado: Schema.String,
  codigoCnae: Schema.NullOr(Schema.Finite),
  nomeCnae: Schema.NullOr(Schema.String),
  naturezaJuridicaNome: Schema.NullOr(Schema.String),
  porteEmpresaNome: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type FornecedorFlat = (typeof FornecedorFlat)["Type"];

export const pageUrl = (opts: {
  readonly pagina: number;
  readonly tamanhoPagina: number;
  readonly ativo: boolean;
}) => {
  const tamanho = Math.min(
    Math.max(opts.tamanhoPagina, pageSizes.min),
    pageSizes.max
  );
  const params = new URLSearchParams({
    pagina: String(opts.pagina),
    tamanhoPagina: String(tamanho),
    ativo: String(opts.ativo),
  });
  return `${consultarUrl}?${params.toString()}`;
};

type Loose = string | number | boolean | null | undefined;

const toStringOrNull = (value: Loose) =>
  value === null || value === undefined
    ? null
    : pipe(String(value), Str.trim, (text) => (text.length > 0 ? text : null));

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

const normalizeCnpjLoose = (value: Loose) => {
  const text = toStringOrNull(value);
  const digits = text === null ? "" : onlyDigits(text);
  return digits.length === 14 ? digits : null;
};

const ufUpper = (value: Loose) => {
  const text = toStringOrNull(value);
  return text === null ? null : Str.toUpperCase(text);
};

const flattenFornecedor = (raw: FornecedorRaw) => {
  const nomeRazaoSocial = toStringOrNull(raw.nomeRazaoSocialFornecedor);
  const nomeMunicipio = toStringOrNull(raw.nomeMunicipio);
  return {
    cnpj: normalizeCnpjLoose(raw.cnpj),
    cpf: toStringOrNull(raw.cpf),
    nomeRazaoSocial,
    ativo: toBool(raw.ativo),
    habilitadoLicitar: toBool(raw.habilitadoLicitar),
    ufSigla: ufUpper(raw.ufSigla),
    nomeMunicipio,
    nomeMunicipioNormalizado: normalize(nomeMunicipio ?? ""),
    codigoCnae: toIntOrNull(raw.codigoCnae),
    nomeCnae: toStringOrNull(raw.nomeCnae),
    naturezaJuridicaNome: toStringOrNull(raw.naturezaJuridicaNome),
    porteEmpresaNome: toStringOrNull(raw.porteEmpresaNome),
    busca: normalize(nomeRazaoSocial ?? ""),
  } satisfies FornecedorFlat;
};

export const flatten = (resultado: readonly FornecedorRaw[]) =>
  pipe(resultado, Arr.map(flattenFornecedor));
