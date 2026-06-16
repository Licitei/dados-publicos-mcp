import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const base = "https://pncp.gov.br/api/consulta/v1";

export const endpoints = {
  contratacoes: "contratacoes/publicacao",
  contratos: "contratos",
  atas: "atas",
} as const;

export const pageSizes = { min: 10, max: 50 } as const;

export const modalidades = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;

export const defaultModalidades = [6, 8] as const;

export const defaultWindowDays = 7;

type PageUrlOptions = {
  readonly endpoint: string;
  readonly pagina: number;
  readonly tamanhoPagina: number;
  readonly dataInicial: string;
  readonly dataFinal: string;
  readonly codigoModalidadeContratacao?: number;
  readonly uf?: string;
};

export const pageUrl = (opts: PageUrlOptions) => {
  const tamanho = Math.min(
    Math.max(opts.tamanhoPagina, pageSizes.min),
    pageSizes.max
  );
  const entries: ReadonlyArray<
    readonly [string, string | number | undefined | null]
  > = [
    ["pagina", opts.pagina],
    ["tamanhoPagina", tamanho],
    ["dataInicial", opts.dataInicial],
    ["dataFinal", opts.dataFinal],
    ["codigoModalidadeContratacao", opts.codigoModalidadeContratacao],
    ["uf", opts.uf],
  ];
  const params = new URLSearchParams(
    entries
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && String(value).length !== 0
      )
      .map(([key, value]) => [key, String(value)])
  );
  return `${base}/${opts.endpoint}?${params.toString()}`;
};

const looseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))
);
const looseString = Schema.optional(Schema.NullOr(Schema.String));
const looseFlag = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean]))
);

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
  totalPaginas: Schema.Number,
  paginasRestantes: Schema.optional(Schema.Number),
});

export const ContratoPayload = Schema.Struct({
  data: Schema.Array(ContratoRaw),
  totalPaginas: Schema.Number,
  paginasRestantes: Schema.optional(Schema.Number),
});

export const AtaPayload = Schema.Struct({
  data: Schema.Array(AtaRaw),
  totalPaginas: Schema.Number,
  paginasRestantes: Schema.optional(Schema.Number),
});

export const ContratacaoFlat = Schema.Struct({
  numeroControlePNCP: Schema.String,
  anoCompra: Schema.NullOr(Schema.Number),
  sequencialCompra: Schema.NullOr(Schema.Number),
  objetoCompra: Schema.NullOr(Schema.String),
  modalidadeId: Schema.NullOr(Schema.Number),
  modalidadeNome: Schema.NullOr(Schema.String),
  situacaoCompraNome: Schema.NullOr(Schema.String),
  valorTotalEstimado: Schema.NullOr(Schema.Number),
  valorTotalHomologado: Schema.NullOr(Schema.Number),
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
export type ContratacaoFlat = (typeof ContratacaoFlat)["Type"];

export const ContratoFlat = Schema.Struct({
  numeroControlePNCP: Schema.String,
  numeroControlePncpCompra: Schema.NullOr(Schema.String),
  anoContrato: Schema.NullOr(Schema.Number),
  sequencialContrato: Schema.NullOr(Schema.Number),
  objetoContrato: Schema.NullOr(Schema.String),
  niFornecedor: Schema.NullOr(Schema.String),
  tipoPessoa: Schema.NullOr(Schema.String),
  nomeRazaoSocialFornecedor: Schema.NullOr(Schema.String),
  niFornecedorSubContratado: Schema.NullOr(Schema.String),
  nomeFornecedorSubContratado: Schema.NullOr(Schema.String),
  valorInicial: Schema.NullOr(Schema.Number),
  valorGlobal: Schema.NullOr(Schema.Number),
  valorAcumulado: Schema.NullOr(Schema.Number),
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
export type ContratoFlat = (typeof ContratoFlat)["Type"];

export const AtaFlat = Schema.Struct({
  numeroControlePNCPAta: Schema.String,
  numeroControlePNCPCompra: Schema.NullOr(Schema.String),
  anoAta: Schema.NullOr(Schema.Number),
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
export type AtaFlat = (typeof AtaFlat)["Type"];

export const PncpErrorCode = Schema.Literals([
  "pncp.MISSING_TERMO",
  "pncp.MISSING_FORNECEDOR",
  "pncp.MISSING_NI",
]);
export type PncpErrorCode = (typeof PncpErrorCode)["Type"];

export class PncpError extends Schema.TaggedErrorClass<PncpError>()("PncpError", {
  code: PncpErrorCode,
}) {
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

type Loose = string | number | boolean | null | undefined;

const toStringOrNull = (value: Loose) =>
  value === null || value === undefined ? null : String(value).trim() || null;

const toIntOrNull = (value: Loose) => {
  const text = toStringOrNull(value);
  const parsed = text === null ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toRealOrNull = (value: Loose) => {
  const text = toStringOrNull(value);
  const parsed = text === null ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBool = (value: Loose) =>
  typeof value === "boolean"
    ? value
    : typeof value === "string"
      ? value.trim().toLowerCase() === "true"
      : value === null || value === undefined
        ? null
        : Boolean(value);

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

const firstString = (...values: readonly Loose[]) =>
  values.map(toStringOrNull).find((value) => value !== null) ?? null;

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
          dataAtualizacaoGlobal: firstString(
            raw.dataAtualizacaoGlobal,
            raw.dataAtualizacao
          ),
          orgaoCnpj: toStringOrNull(orgao?.cnpj),
          orgaoRazaoSocial: toStringOrNull(orgao?.razaoSocial),
          esferaId: toStringOrNull(orgao?.esferaId),
          poderId: toStringOrNull(orgao?.poderId),
          codigoIbge: toStringOrNull(unidade?.codigoIbge),
          municipioNome: toStringOrNull(unidade?.municipioNome),
          ufSigla: toStringOrNull(unidade?.ufSigla),
          srp: toBool(raw.srp),
          busca: normalize(objetoCompra ?? ""),
        } satisfies ContratacaoFlat,
      ];
};

export const flattenContratacoes = (rows: readonly ContratacaoRaw[]) =>
  rows.flatMap(flattenContratacao);

const flattenContrato = (raw: ContratoRaw) => {
  const numeroControlePNCP = toStringOrNull(raw.numeroControlePNCP);
  const orgao = raw.orgaoEntidade;
  const unidade = raw.unidadeOrgao;
  const objetoContrato = toStringOrNull(raw.objetoContrato);
  const nomeRazaoSocialFornecedor = toStringOrNull(
    raw.nomeRazaoSocialFornecedor
  );
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
          niFornecedorSubContratado: toStringOrNull(
            raw.niFornecedorSubContratado
          ),
          nomeFornecedorSubContratado: toStringOrNull(
            raw.nomeFornecedorSubContratado
          ),
          valorInicial: toRealOrNull(raw.valorInicial),
          valorGlobal: toRealOrNull(raw.valorGlobal),
          valorAcumulado: toRealOrNull(raw.valorAcumulado),
          dataAssinatura: toStringOrNull(raw.dataAssinatura),
          dataVigenciaInicio: toStringOrNull(raw.dataVigenciaInicio),
          dataVigenciaFim: toStringOrNull(raw.dataVigenciaFim),
          dataPublicacaoPncp: toStringOrNull(raw.dataPublicacaoPncp),
          dataAtualizacaoGlobal: firstString(
            raw.dataAtualizacaoGlobal,
            raw.dataAtualizacao
          ),
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
  rows.flatMap(flattenContrato);

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
          dataAtualizacaoGlobal: firstString(
            raw.dataAtualizacaoGlobal,
            raw.dataAtualizacao
          ),
          cnpjOrgao: toStringOrNull(raw.cnpjOrgao),
          nomeOrgao: toStringOrNull(raw.nomeOrgao),
          codigoUnidadeOrgao: toStringOrNull(raw.codigoUnidadeOrgao),
          ufSigla: toStringOrNull(raw.ufSigla),
          busca: normalize(objetoContratacao ?? ""),
        } satisfies AtaFlat,
      ];
};

export const flattenAtas = (rows: readonly AtaRaw[]) => rows.flatMap(flattenAta);

export const passageContratacao = (row: ContratacaoFlat) =>
  cleanText(row.objetoCompra ?? "");

export const passageContrato = (row: ContratoFlat) =>
  cleanText(row.objetoContrato ?? "");

export const passageAta = (row: AtaFlat) =>
  cleanText(row.objetoContratacao ?? "");

const pad = (value: number) => String(value).padStart(2, "0");

export const ymd = (millis: number) => {
  const date = new Date(millis);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}`;
};

export const defaultWindowStart = (millis: number) =>
  ymd(millis - defaultWindowDays * 24 * 60 * 60 * 1000);
