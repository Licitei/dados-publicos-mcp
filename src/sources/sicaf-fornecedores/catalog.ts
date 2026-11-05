import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { pagedParams } from "../../kernel/http/paging";
import type { DuckTable } from "../../kernel/duck/duck";
import {
  looseText,
  looseString,
  looseFlag,
  toStringOrNull,
  toIntOrNull,
  toBool,
  type Loose,
} from "../../kernel/schema/loose";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const fornecedorTable: DuckTable = {
  name: "fornecedor",
  key: "id",
  columns: {
    id: "BIGINT",
    cnpj: "VARCHAR",
    cpf: "VARCHAR",
    nomeRazaoSocial: "VARCHAR",
    ativo: "BOOLEAN",
    habilitadoLicitar: "BOOLEAN",
    ufSigla: "VARCHAR",
    nomeMunicipio: "VARCHAR",
    nomeMunicipioNormalizado: "VARCHAR",
    codigoCnae: "INTEGER",
    nomeCnae: "VARCHAR",
    naturezaJuridicaNome: "VARCHAR",
    porteEmpresaNome: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const consultarUrl = "https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor";

export const pageSizes = { min: 10, max: 500 } as const;
export const ativoFlags = [true, false] as const;

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
type FornecedorFlat = (typeof FornecedorFlat)["Type"];

export const pageUrl = (opts: {
  readonly pagina: number;
  readonly tamanhoPagina: number;
  readonly ativo: boolean;
}) => {
  const params = pagedParams({ ...opts, ...pageSizes });
  params.set("ativo", String(opts.ativo));
  return `${consultarUrl}?${params.toString()}`;
};

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
