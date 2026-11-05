import { DateTime, Option, Predicate, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import type { DuckTable } from "../../kernel/duck/duck";
import {
  looseText,
  looseString,
  looseFlag,
  toStringOrNull,
  toIntOrNull,
  toRealOrNull,
  toBool,
  type Loose,
} from "../../kernel/schema/loose";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

const base = "https://pncp.gov.br/api/consulta/v1";

export const endpoints = {
  contratacoes: "contratacoes/publicacao",
  contratos: "contratos",
  atas: "atas",
} as const;

export const pageSizes = { min: 10, max: 50 } as const;

export const defaultModalidades = [6, 8] as const;

const defaultWindowDays = 7;

const PageUrlOptions = Schema.Struct({
  endpoint: Schema.String,
  pagina: Schema.Finite,
  tamanhoPagina: Schema.Finite,
  dataInicial: Schema.String,
  dataFinal: Schema.String,
  codigoModalidadeContratacao: Schema.optionalKey(Schema.Finite),
  uf: Schema.optionalKey(Schema.String),
});
type PageUrlOptions = (typeof PageUrlOptions)["Type"];

export const pageUrl = (opts: PageUrlOptions) => {
  const tamanho = Math.min(Math.max(opts.tamanhoPagina, pageSizes.min), pageSizes.max);
  const entries: ReadonlyArray<readonly [string, string | number | undefined | null]> = [
    ["pagina", opts.pagina],
    ["tamanhoPagina", tamanho],
    ["dataInicial", opts.dataInicial],
    ["dataFinal", opts.dataFinal],
    ["codigoModalidadeContratacao", opts.codigoModalidadeContratacao],
    ["uf", opts.uf],
  ];
  const params = new URLSearchParams(
    pipe(
      entries,
      Arr.filter(
        ([, value]) => value !== undefined && value !== null && String(value).length !== 0
      ),
      Arr.map(([key, value]) => [key, String(value)] as const)
    )
  );
  return `${base}/${opts.endpoint}?${params.toString()}`;
};

const orgaoEntidadeRaw = Schema.optional(
  Schema.NullOr(
    Schema.Struct({
      cnpj: looseText,
      razaoSocial: looseString,
      esferaId: looseText,
      poderId: looseText,
    })
  )
);

const unidadeOrgaoRaw = Schema.optional(
  Schema.NullOr(
    Schema.Struct({
      codigoIbge: looseText,
      municipioNome: looseString,
      ufSigla: looseString,
    })
  )
);

export const ContratacaoRaw = Schema.Struct({
  numeroControlePNCP: looseText,
  anoCompra: looseText,
  sequencialCompra: looseText,
  objetoCompra: looseString,
  modalidadeId: looseText,
  modalidadeNome: looseString,
  situacaoCompraNome: looseString,
  valorTotalEstimado: looseText,
  valorTotalHomologado: looseText,
  dataPublicacaoPncp: looseString,
  dataAberturaProposta: looseString,
  dataEncerramentoProposta: looseString,
  dataAtualizacaoGlobal: looseString,
  dataAtualizacao: looseString,
  srp: looseFlag,
  orgaoEntidade: orgaoEntidadeRaw,
  unidadeOrgao: unidadeOrgaoRaw,
});
export type ContratacaoRaw = (typeof ContratacaoRaw)["Type"];

export const ContratoRaw = Schema.Struct({
  numeroControlePNCP: looseText,
  numeroControlePncpCompra: looseString,
  anoContrato: looseText,
  sequencialContrato: looseText,
  objetoContrato: looseString,
  niFornecedor: looseText,
  tipoPessoa: looseString,
  nomeRazaoSocialFornecedor: looseString,
  niFornecedorSubContratado: looseText,
  nomeFornecedorSubContratado: looseString,
  valorInicial: looseText,
  valorGlobal: looseText,
  valorAcumulado: looseText,
  dataAssinatura: looseString,
  dataVigenciaInicio: looseString,
  dataVigenciaFim: looseString,
  dataPublicacaoPncp: looseString,
  dataAtualizacaoGlobal: looseString,
  dataAtualizacao: looseString,
  tipoContrato: looseString,
  orgaoEntidade: orgaoEntidadeRaw,
  unidadeOrgao: unidadeOrgaoRaw,
});
export type ContratoRaw = (typeof ContratoRaw)["Type"];

export const AtaRaw = Schema.Struct({
  numeroControlePNCPAta: looseString,
  numeroControlePncpAta: looseString,
  numeroControlePNCP: looseString,
  numeroControlePNCPCompra: looseString,
  numeroControlePncpCompra: looseString,
  anoAta: looseText,
  numeroAtaRegistroPreco: looseString,
  objetoContratacao: looseString,
  objetoCompra: looseString,
  vigenciaInicio: looseString,
  vigenciaFim: looseString,
  dataAtualizacaoGlobal: looseString,
  dataAtualizacao: looseString,
  cnpjOrgao: looseString,
  nomeOrgao: looseString,
  codigoUnidadeOrgao: looseString,
  ufSigla: looseString,
});
export type AtaRaw = (typeof AtaRaw)["Type"];

export const ContratacaoPayload = Schema.Struct({
  data: Schema.Array(ContratacaoRaw),
  totalPaginas: Schema.Finite,
  paginasRestantes: Schema.optional(Schema.Finite),
});

export const ContratoPayload = Schema.Struct({
  data: Schema.Array(ContratoRaw),
  totalPaginas: Schema.Finite,
  paginasRestantes: Schema.optional(Schema.Finite),
});

export const AtaPayload = Schema.Struct({
  data: Schema.Array(AtaRaw),
  totalPaginas: Schema.Finite,
  paginasRestantes: Schema.optional(Schema.Finite),
});

const ContratacaoFlat = Schema.Struct({
  numeroControlePNCP: Schema.String,
  anoCompra: Schema.NullOr(Schema.Finite),
  sequencialCompra: Schema.NullOr(Schema.Finite),
  objetoCompra: Schema.NullOr(Schema.String),
  modalidadeId: Schema.NullOr(Schema.Finite),
  modalidadeNome: Schema.NullOr(Schema.String),
  situacaoCompraNome: Schema.NullOr(Schema.String),
  valorTotalEstimado: Schema.NullOr(Schema.Finite),
  valorTotalHomologado: Schema.NullOr(Schema.Finite),
  dataPublicacaoPncp: Schema.NullOr(Schema.String),
  dataAberturaProposta: Schema.NullOr(Schema.String),
  dataEncerramentoProposta: Schema.NullOr(Schema.String),
  dataAtualizacaoGlobal: Schema.NullOr(Schema.String),
  orgaoCnpj: Schema.NullOr(Schema.String),
  orgaoRazaoSocial: Schema.NullOr(Schema.String),
  esferaId: Schema.NullOr(Schema.String),
  poderId: Schema.NullOr(Schema.String),
  codigoIbge: Schema.NullOr(Schema.String),
  municipioNome: Schema.NullOr(Schema.String),
  ufSigla: Schema.NullOr(Schema.String),
  srp: Schema.NullOr(Schema.Boolean),
  busca: Schema.String,
});
type ContratacaoFlat = (typeof ContratacaoFlat)["Type"];

const ContratoFlat = Schema.Struct({
  numeroControlePNCP: Schema.String,
  numeroControlePncpCompra: Schema.NullOr(Schema.String),
  anoContrato: Schema.NullOr(Schema.Finite),
  sequencialContrato: Schema.NullOr(Schema.Finite),
  objetoContrato: Schema.NullOr(Schema.String),
  niFornecedor: Schema.NullOr(Schema.String),
  tipoPessoa: Schema.NullOr(Schema.String),
  nomeRazaoSocialFornecedor: Schema.NullOr(Schema.String),
  niFornecedorSubContratado: Schema.NullOr(Schema.String),
  nomeFornecedorSubContratado: Schema.NullOr(Schema.String),
  valorInicial: Schema.NullOr(Schema.Finite),
  valorGlobal: Schema.NullOr(Schema.Finite),
  valorAcumulado: Schema.NullOr(Schema.Finite),
  dataAssinatura: Schema.NullOr(Schema.String),
  dataVigenciaInicio: Schema.NullOr(Schema.String),
  dataVigenciaFim: Schema.NullOr(Schema.String),
  dataPublicacaoPncp: Schema.NullOr(Schema.String),
  dataAtualizacaoGlobal: Schema.NullOr(Schema.String),
  orgaoCnpj: Schema.NullOr(Schema.String),
  orgaoRazaoSocial: Schema.NullOr(Schema.String),
  codigoIbge: Schema.NullOr(Schema.String),
  ufSigla: Schema.NullOr(Schema.String),
  tipoContrato: Schema.NullOr(Schema.String),
  busca: Schema.String,
  buscaFornecedor: Schema.String,
});
type ContratoFlat = (typeof ContratoFlat)["Type"];

const AtaFlat = Schema.Struct({
  numeroControlePNCPAta: Schema.String,
  numeroControlePNCPCompra: Schema.NullOr(Schema.String),
  anoAta: Schema.NullOr(Schema.Finite),
  numeroAtaRegistroPreco: Schema.NullOr(Schema.String),
  objetoContratacao: Schema.NullOr(Schema.String),
  vigenciaInicio: Schema.NullOr(Schema.String),
  vigenciaFim: Schema.NullOr(Schema.String),
  dataAtualizacaoGlobal: Schema.NullOr(Schema.String),
  cnpjOrgao: Schema.NullOr(Schema.String),
  nomeOrgao: Schema.NullOr(Schema.String),
  codigoUnidadeOrgao: Schema.NullOr(Schema.String),
  ufSigla: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
type AtaFlat = (typeof AtaFlat)["Type"];

export const contratacaoTable: DuckTable = {
  name: "contratacao",
  key: "numeroControlePNCP",
  columns: {
    numeroControlePNCP: "VARCHAR",
    anoCompra: "INTEGER",
    sequencialCompra: "INTEGER",
    objetoCompra: "VARCHAR",
    modalidadeId: "INTEGER",
    modalidadeNome: "VARCHAR",
    situacaoCompraNome: "VARCHAR",
    valorTotalEstimado: "DOUBLE",
    valorTotalHomologado: "DOUBLE",
    dataPublicacaoPncp: "VARCHAR",
    dataAberturaProposta: "VARCHAR",
    dataEncerramentoProposta: "VARCHAR",
    dataAtualizacaoGlobal: "VARCHAR",
    orgaoCnpj: "VARCHAR",
    orgaoRazaoSocial: "VARCHAR",
    esferaId: "VARCHAR",
    poderId: "VARCHAR",
    codigoIbge: "VARCHAR",
    municipioNome: "VARCHAR",
    ufSigla: "VARCHAR",
    srp: "BOOLEAN",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const contratoTable: DuckTable = {
  name: "contrato",
  key: "numeroControlePNCP",
  columns: {
    numeroControlePNCP: "VARCHAR",
    numeroControlePncpCompra: "VARCHAR",
    anoContrato: "INTEGER",
    sequencialContrato: "INTEGER",
    objetoContrato: "VARCHAR",
    niFornecedor: "VARCHAR",
    tipoPessoa: "VARCHAR",
    nomeRazaoSocialFornecedor: "VARCHAR",
    niFornecedorSubContratado: "VARCHAR",
    nomeFornecedorSubContratado: "VARCHAR",
    valorInicial: "DOUBLE",
    valorGlobal: "DOUBLE",
    valorAcumulado: "DOUBLE",
    dataAssinatura: "VARCHAR",
    dataVigenciaInicio: "VARCHAR",
    dataVigenciaFim: "VARCHAR",
    dataPublicacaoPncp: "VARCHAR",
    dataAtualizacaoGlobal: "VARCHAR",
    orgaoCnpj: "VARCHAR",
    orgaoRazaoSocial: "VARCHAR",
    codigoIbge: "VARCHAR",
    ufSigla: "VARCHAR",
    tipoContrato: "VARCHAR",
    busca: "VARCHAR",
    buscaFornecedor: "VARCHAR",
  },
  search: ["busca"],
};

export const contratoFornecedorTable: DuckTable = {
  name: "contrato_fornecedor",
  key: "numeroControlePNCP",
  columns: { numeroControlePNCP: "VARCHAR", buscaFornecedor: "VARCHAR" },
  search: ["buscaFornecedor"],
};

export const ataTable: DuckTable = {
  name: "ata",
  key: "numeroControlePNCPAta",
  columns: {
    numeroControlePNCPAta: "VARCHAR",
    numeroControlePNCPCompra: "VARCHAR",
    anoAta: "INTEGER",
    numeroAtaRegistroPreco: "VARCHAR",
    objetoContratacao: "VARCHAR",
    vigenciaInicio: "VARCHAR",
    vigenciaFim: "VARCHAR",
    dataAtualizacaoGlobal: "VARCHAR",
    cnpjOrgao: "VARCHAR",
    nomeOrgao: "VARCHAR",
    codigoUnidadeOrgao: "VARCHAR",
    ufSigla: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const PncpErrorCode = Schema.Literals([
  "pncp.MISSING_TERMO",
  "pncp.MISSING_FORNECEDOR",
  "pncp.MISSING_NI",
]);

export class PncpError extends Schema.TaggedError<PncpError, { readonly brand: unique symbol }>()(
  "PncpError",
  {
    code: PncpErrorCode,
  }
) {
  override get message() {
    switch (this.code) {
      case "pncp.MISSING_TERMO":
        return "Informe um termo de busca para consultar o PNCP.";
      case "pncp.MISSING_FORNECEDOR":
        return "Informe o nome do fornecedor para a busca.";
      case "pncp.MISSING_NI":
        return "Informe um CNPJ ou CPF valido do fornecedor.";
    }
  }
}

const firstString = (...values: readonly Loose[]) =>
  pipe(values, Arr.map(toStringOrNull), Arr.findFirst(Predicate.isNotNull), Option.getOrNull);

const flattenContratacao = (raw: ContratacaoRaw) => {
  const numeroControlePNCP = toStringOrNull(raw.numeroControlePNCP);
  const orgao = raw.orgaoEntidade;
  const unidade = raw.unidadeOrgao;
  const objetoCompra = toStringOrNull(raw.objetoCompra);
  return numeroControlePNCP === null
    ? []
    : [
        {
          numeroControlePNCP,
          anoCompra: toIntOrNull(raw.anoCompra),
          sequencialCompra: toIntOrNull(raw.sequencialCompra),
          objetoCompra,
          modalidadeId: toIntOrNull(raw.modalidadeId),
          modalidadeNome: toStringOrNull(raw.modalidadeNome),
          situacaoCompraNome: toStringOrNull(raw.situacaoCompraNome),
          valorTotalEstimado: toRealOrNull(raw.valorTotalEstimado),
          valorTotalHomologado: toRealOrNull(raw.valorTotalHomologado),
          dataPublicacaoPncp: toStringOrNull(raw.dataPublicacaoPncp),
          dataAberturaProposta: toStringOrNull(raw.dataAberturaProposta),
          dataEncerramentoProposta: toStringOrNull(raw.dataEncerramentoProposta),
          dataAtualizacaoGlobal: firstString(raw.dataAtualizacaoGlobal, raw.dataAtualizacao),
          orgaoCnpj: toStringOrNull(orgao?.cnpj),
          orgaoRazaoSocial: toStringOrNull(orgao?.razaoSocial),
          esferaId: toStringOrNull(orgao?.esferaId),
          poderId: toStringOrNull(orgao?.poderId),
          codigoIbge: toStringOrNull(unidade?.codigoIbge),
          municipioNome: toStringOrNull(unidade?.municipioNome),
          ufSigla: toStringOrNull(unidade?.ufSigla),
          srp: Predicate.isNullish(raw.srp) ? null : toBool(raw.srp),
          busca: normalize(objetoCompra ?? ""),
        } satisfies ContratacaoFlat,
      ];
};

export const flattenContratacoes = (rows: readonly ContratacaoRaw[]) =>
  Arr.flatMap(rows, flattenContratacao);

const flattenContrato = (raw: ContratoRaw) => {
  const numeroControlePNCP = toStringOrNull(raw.numeroControlePNCP);
  const orgao = raw.orgaoEntidade;
  const unidade = raw.unidadeOrgao;
  const objetoContrato = toStringOrNull(raw.objetoContrato);
  const nomeRazaoSocialFornecedor = toStringOrNull(raw.nomeRazaoSocialFornecedor);
  return numeroControlePNCP === null
    ? []
    : [
        {
          numeroControlePNCP,
          numeroControlePncpCompra: toStringOrNull(raw.numeroControlePncpCompra),
          anoContrato: toIntOrNull(raw.anoContrato),
          sequencialContrato: toIntOrNull(raw.sequencialContrato),
          objetoContrato,
          niFornecedor: onlyDigits(toStringOrNull(raw.niFornecedor) ?? ""),
          tipoPessoa: toStringOrNull(raw.tipoPessoa),
          nomeRazaoSocialFornecedor,
          niFornecedorSubContratado: toStringOrNull(raw.niFornecedorSubContratado),
          nomeFornecedorSubContratado: toStringOrNull(raw.nomeFornecedorSubContratado),
          valorInicial: toRealOrNull(raw.valorInicial),
          valorGlobal: toRealOrNull(raw.valorGlobal),
          valorAcumulado: toRealOrNull(raw.valorAcumulado),
          dataAssinatura: toStringOrNull(raw.dataAssinatura),
          dataVigenciaInicio: toStringOrNull(raw.dataVigenciaInicio),
          dataVigenciaFim: toStringOrNull(raw.dataVigenciaFim),
          dataPublicacaoPncp: toStringOrNull(raw.dataPublicacaoPncp),
          dataAtualizacaoGlobal: firstString(raw.dataAtualizacaoGlobal, raw.dataAtualizacao),
          orgaoCnpj: toStringOrNull(orgao?.cnpj),
          orgaoRazaoSocial: toStringOrNull(orgao?.razaoSocial),
          codigoIbge: toStringOrNull(unidade?.codigoIbge),
          ufSigla: toStringOrNull(unidade?.ufSigla),
          tipoContrato: toStringOrNull(raw.tipoContrato),
          busca: normalize(objetoContrato ?? ""),
          buscaFornecedor: normalize(nomeRazaoSocialFornecedor ?? ""),
        } satisfies ContratoFlat,
      ];
};

export const flattenContratos = (rows: readonly ContratoRaw[]) =>
  Arr.flatMap(rows, flattenContrato);

const flattenAta = (raw: AtaRaw) => {
  const numeroControlePNCPAta = firstString(
    raw.numeroControlePNCPAta,
    raw.numeroControlePncpAta,
    raw.numeroControlePNCP
  );
  const objetoContratacao = firstString(raw.objetoContratacao, raw.objetoCompra);
  return numeroControlePNCPAta === null
    ? []
    : [
        {
          numeroControlePNCPAta,
          numeroControlePNCPCompra: firstString(
            raw.numeroControlePNCPCompra,
            raw.numeroControlePncpCompra
          ),
          anoAta: toIntOrNull(raw.anoAta),
          numeroAtaRegistroPreco: toStringOrNull(raw.numeroAtaRegistroPreco),
          objetoContratacao,
          vigenciaInicio: toStringOrNull(raw.vigenciaInicio),
          vigenciaFim: toStringOrNull(raw.vigenciaFim),
          dataAtualizacaoGlobal: firstString(raw.dataAtualizacaoGlobal, raw.dataAtualizacao),
          cnpjOrgao: toStringOrNull(raw.cnpjOrgao),
          nomeOrgao: toStringOrNull(raw.nomeOrgao),
          codigoUnidadeOrgao: toStringOrNull(raw.codigoUnidadeOrgao),
          ufSigla: toStringOrNull(raw.ufSigla),
          busca: normalize(objetoContratacao ?? ""),
        } satisfies AtaFlat,
      ];
};

export const flattenAtas = (rows: readonly AtaRaw[]) => Arr.flatMap(rows, flattenAta);

const pad = (value: number) => Str.padStart(2, "0")(String(value));

export const ymd = (millis: number) => {
  const date = DateTime.makeUnsafe(millis);
  return `${DateTime.getPartUtc(date, "year")}${pad(
    DateTime.getPartUtc(date, "month")
  )}${pad(DateTime.getPartUtc(date, "day"))}`;
};

export const defaultWindowStart = (millis: number) =>
  ymd(millis - defaultWindowDays * 24 * 60 * 60 * 1000);
