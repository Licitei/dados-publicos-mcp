import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pagedParams } from "../../kernel/http/paging";
import type { DuckTable } from "../../kernel/duck/duck";
import {
  looseText,
  looseString,
  looseFlag,
  toStringOrNull,
  toIntOrNull,
  toBool,
  joinText,
} from "../../kernel/schema/loose";
import { normalize } from "../../kernel/text/normalize";

export const endpoints = {
  catmatItem: "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial",
  catserItem: "https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico",
} as const;

export const pageSizes = { min: 10, max: 500 } as const;

export const pageUrl = (opts: {
  readonly endpoint: string;
  readonly pagina: number;
  readonly tamanhoPagina: number;
}) => `${opts.endpoint}?${pagedParams({ ...opts, ...pageSizes }).toString()}`;

const CatmatItemRaw = Schema.Struct({
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
type CatmatItemRaw = (typeof CatmatItemRaw)["Type"];

const CatserItemRaw = Schema.Struct({
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
type CatserItemRaw = (typeof CatserItemRaw)["Type"];

export const CatmatItemPayload = Schema.Struct({
  resultado: Schema.Array(CatmatItemRaw),
  totalPaginas: Schema.Finite,
});

export const CatserItemPayload = Schema.Struct({
  resultado: Schema.Array(CatserItemRaw),
  totalPaginas: Schema.Finite,
});

const CatmatMaterialFlat = Schema.Struct({
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
type CatmatMaterialFlat = (typeof CatmatMaterialFlat)["Type"];

const CatserServiceFlat = Schema.Struct({
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
type CatserServiceFlat = (typeof CatserServiceFlat)["Type"];

export const catmatMaterialTable: DuckTable = {
  name: "catmat_material",
  key: "codigoItem",
  columns: {
    codigoItem: "INTEGER",
    codigoGrupo: "INTEGER",
    nomeGrupo: "VARCHAR",
    codigoClasse: "INTEGER",
    nomeClasse: "VARCHAR",
    codigoPdm: "INTEGER",
    nomePdm: "VARCHAR",
    descricaoItem: "VARCHAR",
    codigoNcm: "VARCHAR",
    descricaoNcm: "VARCHAR",
    statusItem: "BOOLEAN",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const catserServiceTable: DuckTable = {
  name: "catser_service",
  key: "codigoServico",
  columns: {
    codigoServico: "INTEGER",
    nomeServico: "VARCHAR",
    codigoSecao: "INTEGER",
    nomeSecao: "VARCHAR",
    codigoDivisao: "INTEGER",
    nomeDivisao: "VARCHAR",
    codigoGrupo: "INTEGER",
    nomeGrupo: "VARCHAR",
    codigoClasse: "INTEGER",
    nomeClasse: "VARCHAR",
    codigoSubclasse: "INTEGER",
    nomeSubclasse: "VARCHAR",
    statusServico: "BOOLEAN",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

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
