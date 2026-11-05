import { DateTime, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import type { DuckTable } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickFirst, numeroBr, dataBr } from "../../kernel/csv/fields";

export const sancaoTable: DuckTable = {
  name: "sancao",
  key: "id",
  columns: {
    id: "BIGINT",
    lista: "VARCHAR",
    codigo: "VARCHAR",
    tipoPessoa: "VARCHAR",
    documento: "VARCHAR",
    docNormalizado: "VARCHAR",
    nome: "VARCHAR",
    razaoSocial: "VARCHAR",
    categoria: "VARCHAR",
    numeroProcesso: "VARCHAR",
    valorMulta: "DOUBLE",
    dataInicio: "VARCHAR",
    dataFinal: "VARCHAR",
    dataPublicacao: "VARCHAR",
    orgaoSancionador: "VARCHAR",
    ufOrgao: "VARCHAR",
    fundamentacao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const cdnBase = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const lookbackDays = 7;

const DatasetKey = Schema.Literals(["ceis", "cnep", "ceaf", "cepim", "acordos-leniencia"]);
type DatasetKey = (typeof DatasetKey)["Type"];

const DatasetSpec = Schema.Struct({
  key: DatasetKey,
  zipSuffix: Schema.String,
  label: Schema.String,
});
export type DatasetSpec = (typeof DatasetSpec)["Type"];

export const datasets: readonly DatasetSpec[] = [
  {
    key: "ceis",
    zipSuffix: "CEIS",
    label: "CEIS - Empresas Inidoneas e Suspensas",
  },
  {
    key: "cnep",
    zipSuffix: "CNEP",
    label: "CNEP - Empresas Punidas (Lei 12.846)",
  },
  {
    key: "ceaf",
    zipSuffix: "CEAF",
    label: "CEAF - Expulsoes da Administracao Federal",
  },
  {
    key: "cepim",
    zipSuffix: "CEPIM",
    label: "CEPIM - Entidades Privadas Impedidas",
  },
  {
    key: "acordos-leniencia",
    zipSuffix: "AcordosLeniencia",
    label: "Acordos de Leniencia (Lei 12.846)",
  },
];

export const zipUrl: {
  (snapshotDate: string): (dataset: DatasetSpec) => string;
  (dataset: DatasetSpec, snapshotDate: string): string;
} = dual(
  2,
  (dataset: DatasetSpec, snapshotDate: string) =>
    `${cdnBase}/${dataset.key}/${snapshotDate}_${dataset.zipSuffix}.zip`
);

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

export const isEfeitosCsv = (name: string) => /efeito/i.test(name);

export const yyyymmdd: {
  (offset: number): (millis: number) => string;
  (millis: number, offset: number): string;
} = dual(2, (millis: number, offset: number) =>
  pipe(
    DateTime.makeUnsafe(millis - offset * 86_400_000),
    DateTime.formatIsoDate,
    Str.replace(/-/g, "")
  )
);

export const SancaoFlat = Schema.Struct({
  lista: Schema.String,
  codigo: Schema.NullOr(Schema.String),
  tipoPessoa: Schema.NullOr(Schema.String),
  documento: Schema.NullOr(Schema.String),
  docNormalizado: Schema.String,
  nome: Schema.NullOr(Schema.String),
  razaoSocial: Schema.NullOr(Schema.String),
  categoria: Schema.NullOr(Schema.String),
  numeroProcesso: Schema.NullOr(Schema.String),
  valorMulta: Schema.NullOr(Schema.Finite),
  dataInicio: Schema.NullOr(Schema.String),
  dataFinal: Schema.NullOr(Schema.String),
  dataPublicacao: Schema.NullOr(Schema.String),
  orgaoSancionador: Schema.NullOr(Schema.String),
  ufOrgao: Schema.NullOr(Schema.String),
  fundamentacao: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type SancaoFlat = (typeof SancaoFlat)["Type"];

const orNull = (value: string) => (value === "" ? null : value);

const cols = {
  codigo: ["CODIGO DA SANCAO"],
  tipoPessoa: ["TIPO DE PESSOA"],
  documento: ["CPF OU CNPJ DO SANCIONADO"],
  nome: ["NOME DO SANCIONADO"],
  razaoSocial: ["RAZAO SOCIAL - CADASTRO RECEITA", "RAZAO SOCIAL CADASTRO RECEITA"],
  categoria: ["CATEGORIA DA SANCAO"],
  numeroProcesso: ["NUMERO DO PROCESSO"],
  valorMulta: ["VALOR DA MULTA"],
  dataInicio: ["DATA INICIO SANCAO", "DATA INICIO DA SANCAO"],
  dataFinal: ["DATA FINAL SANCAO", "DATA FINAL DA SANCAO"],
  dataPublicacao: ["DATA PUBLICACAO", "DATA DE PUBLICACAO"],
  orgao: ["ORGAO SANCIONADOR"],
  ufOrgao: ["UF ORGAO SANCIONADOR"],
  fundamentacao: ["FUNDAMENTACAO LEGAL"],
} as const;

const buscaOf = (...parts: readonly string[]) =>
  normalize(
    pipe(
      parts,
      Arr.filter((part) => part !== ""),
      Arr.join(" ")
    )
  );

const mapSancao = (lista: DatasetKey) => (byKey: Map<string, string>) => {
  const documento = pickFirst(byKey, cols.documento);
  const nome = pickFirst(byKey, cols.nome);
  const razaoSocial = pickFirst(byKey, cols.razaoSocial);
  return {
    lista,
    codigo: orNull(pickFirst(byKey, cols.codigo)),
    tipoPessoa: orNull(pickFirst(byKey, cols.tipoPessoa)),
    documento: orNull(documento),
    docNormalizado: onlyDigits(documento),
    nome: orNull(nome),
    razaoSocial: orNull(razaoSocial),
    categoria: orNull(pickFirst(byKey, cols.categoria)),
    numeroProcesso: orNull(pickFirst(byKey, cols.numeroProcesso)),
    valorMulta: numeroBr(pickFirst(byKey, cols.valorMulta)),
    dataInicio: dataBr(pickFirst(byKey, cols.dataInicio)),
    dataFinal: dataBr(pickFirst(byKey, cols.dataFinal)),
    dataPublicacao: dataBr(pickFirst(byKey, cols.dataPublicacao)),
    orgaoSancionador: orNull(pickFirst(byKey, cols.orgao)),
    ufOrgao: orNull(pickFirst(byKey, cols.ufOrgao)),
    fundamentacao: orNull(pickFirst(byKey, cols.fundamentacao)),
    busca: buscaOf(nome, razaoSocial),
  } satisfies SancaoFlat;
};

const mapCeaf = (byKey: Map<string, string>) =>
  ({
    ...mapSancao("ceaf")(byKey),
    razaoSocial: null,
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    orgaoSancionador: orNull(pickFirst(byKey, [...cols.orgao, "ORGAO DE LOTACAO"])),
    busca: buscaOf(pickFirst(byKey, cols.nome), pickFirst(byKey, ["CARGO EFETIVO"])),
  }) satisfies SancaoFlat;

const mapCepim = (byKey: Map<string, string>) => {
  const documento = pickFirst(byKey, ["CNPJ ENTIDADE", ...cols.documento]);
  const nome = pickFirst(byKey, ["NOME ENTIDADE", ...cols.nome]);
  return {
    lista: "cepim" as const,
    codigo: orNull(pickFirst(byKey, ["NUMERO CONVENIO", ...cols.codigo])),
    tipoPessoa: "J",
    documento: orNull(documento),
    docNormalizado: onlyDigits(documento),
    nome: orNull(nome),
    razaoSocial: null,
    categoria: orNull(pickFirst(byKey, ["MOTIVO DO IMPEDIMENTO"])),
    numeroProcesso: orNull(pickFirst(byKey, ["NUMERO CONVENIO"])),
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    dataPublicacao: null,
    orgaoSancionador: orNull(pickFirst(byKey, ["ORGAO CONCEDENTE", ...cols.orgao])),
    ufOrgao: null,
    fundamentacao: orNull(pickFirst(byKey, ["MOTIVO DO IMPEDIMENTO"])),
    busca: buscaOf(nome),
  } satisfies SancaoFlat;
};

const mapAcordo = (byKey: Map<string, string>) => {
  const documento = pickFirst(byKey, ["CNPJ DO SANCIONADO", ...cols.documento]);
  const razaoSocial = pickFirst(byKey, cols.razaoSocial);
  return {
    lista: "acordos-leniencia" as const,
    codigo: orNull(pickFirst(byKey, ["ID DO ACORDO"])),
    tipoPessoa: "J",
    documento: orNull(documento),
    docNormalizado: onlyDigits(documento),
    nome: orNull(razaoSocial),
    razaoSocial: orNull(razaoSocial),
    categoria: orNull(
      pickFirst(byKey, ["SITUACAO DO ACORDO DE LENIENICA", "SITUACAO DO ACORDO DE LENIENCIA"])
    ),
    numeroProcesso: orNull(pickFirst(byKey, cols.numeroProcesso)),
    valorMulta: null,
    dataInicio: dataBr(pickFirst(byKey, ["DATA DE INICIO DO ACORDO"])),
    dataFinal: dataBr(pickFirst(byKey, ["DATA DE FIM DO ACORDO"])),
    dataPublicacao: null,
    orgaoSancionador: orNull(pickFirst(byKey, cols.orgao)),
    ufOrgao: null,
    fundamentacao: null,
    busca: buscaOf(razaoSocial),
  } satisfies SancaoFlat;
};

const mapperFor = (lista: DatasetKey) =>
  lista === "ceaf"
    ? mapCeaf
    : lista === "cepim"
      ? mapCepim
      : lista === "acordos-leniencia"
        ? mapAcordo
        : mapSancao(lista);

const hasContent = (row: SancaoFlat) =>
  Boolean(row.codigo || row.documento || row.nome || row.razaoSocial || row.docNormalizado);

const mapSancoesImpl = (lista: DatasetKey, records: readonly CsvRecord[]) => {
  const mapper = mapperFor(lista);
  return pipe(
    records,
    Arr.map((record) => mapper(indexByKey(record))),
    Arr.filter(hasContent)
  );
};

export const mapSancoes: {
  (records: readonly CsvRecord[]): (lista: DatasetKey) => ReturnType<typeof mapSancoesImpl>;
  (lista: DatasetKey, records: readonly CsvRecord[]): ReturnType<typeof mapSancoesImpl>;
} = dual(2, mapSancoesImpl);

const SancaoErrorCode = Schema.Literals(["sancoes.SNAPSHOT_MISSING"]);

export class SancaoError extends Schema.TaggedError<
  SancaoError,
  { readonly brand: unique symbol }
>()("SancaoError", {
  code: SancaoErrorCode,
  dataset: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "sancoes.SNAPSHOT_MISSING":
        return `Nenhum snapshot da CGU encontrado para ${this.dataset} nos ultimos ${lookbackDays} dias.`;
    }
  }
}
