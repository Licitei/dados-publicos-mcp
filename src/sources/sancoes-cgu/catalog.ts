import { DateTime, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const cdnBase =
  "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const lookbackDays = 7;

export const missingStatus = new Set([403, 404]);

export type DatasetKey =
  | "ceis"
  | "cnep"
  | "ceaf"
  | "cepim"
  | "acordos-leniencia";

export type DatasetSpec = {
  readonly key: DatasetKey;
  readonly zipSuffix: string;
  readonly label: string;
};

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

const headerKey = (header: string) =>
  pipe(
    header,
    Str.normalize("NFD"),
    Str.replace(/\p{Diacritic}/gu, ""),
    Str.toLowerCase,
    Str.replace(/\s+/g, " "),
    Str.trim
  );

const indexByKey = (record: Record<string, string>) =>
  new Map(
    pipe(
      record,
      Rec.toEntries,
      Arr.map(([key, value]) => [headerKey(key), value] as const)
    )
  );

const pick = (
  byKey: Map<string, string>,
  candidates: readonly string[]
): string =>
  pipe(
    candidates,
    Arr.map((candidate) =>
      pipe(byKey.get(headerKey(candidate)) ?? "", Str.trim)
    ),
    Arr.findFirst((value) => value !== ""),
    Option.getOrElse(() => "")
  );

const numeroBr = (value: string) => {
  const trimmed = Str.trim(value);
  const normalized = Str.includes(",")(trimmed)
    ? pipe(trimmed, Str.replace(/\./g, ""), Str.replace(",", "."))
    : trimmed;
  const cleaned = pipe(normalized, Str.replace(/[^\d.\-]/g, ""));
  const parsed = Number(cleaned);
  return cleaned === "" || cleaned === "-" || !Number.isFinite(parsed)
    ? null
    : parsed;
};

const buildDate = (year: string, month: string, day: string) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  return m < 1 || m > 12 || d < 1 || d > 31 || y < 1
    ? Option.none()
    : Option.some(`${year}-${month}-${day}`);
};

const dataBr = (value: string) => {
  const trimmed = Str.trim(value);
  const slashed = pipe(
    trimmed,
    Str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/),
    Option.flatMap((found) =>
      Option.all([Arr.get(found, 3), Arr.get(found, 2), Arr.get(found, 1)])
    ),
    Option.flatMap(([year, month, day]) =>
      buildDate(year, Str.padStart(2, "0")(month), Str.padStart(2, "0")(day))
    )
  );
  const iso = pipe(
    trimmed,
    Str.match(/^(\d{4})-(\d{2})-(\d{2})$/),
    Option.flatMap((found) =>
      Option.all([Arr.get(found, 1), Arr.get(found, 2), Arr.get(found, 3)])
    ),
    Option.flatMap(([year, month, day]) => buildDate(year, month, day))
  );
  return trimmed === "" || /^0+$/.test(trimmed)
    ? null
    : pipe(slashed, Option.orElse(() => iso), Option.getOrNull);
};

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
  razaoSocial: [
    "RAZAO SOCIAL - CADASTRO RECEITA",
    "RAZAO SOCIAL CADASTRO RECEITA",
  ],
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

const docOf = (documento: string) => onlyDigits(documento);

const mapSancao = (lista: DatasetKey) => (byKey: Map<string, string>) => {
  const documento = pick(byKey, cols.documento);
  const nome = pick(byKey, cols.nome);
  const razaoSocial = pick(byKey, cols.razaoSocial);
  return {
    lista,
    codigo: orNull(pick(byKey, cols.codigo)),
    tipoPessoa: orNull(pick(byKey, cols.tipoPessoa)),
    documento: orNull(documento),
    docNormalizado: docOf(documento),
    nome: orNull(nome),
    razaoSocial: orNull(razaoSocial),
    categoria: orNull(pick(byKey, cols.categoria)),
    numeroProcesso: orNull(pick(byKey, cols.numeroProcesso)),
    valorMulta: numeroBr(pick(byKey, cols.valorMulta)),
    dataInicio: dataBr(pick(byKey, cols.dataInicio)),
    dataFinal: dataBr(pick(byKey, cols.dataFinal)),
    dataPublicacao: dataBr(pick(byKey, cols.dataPublicacao)),
    orgaoSancionador: orNull(pick(byKey, cols.orgao)),
    ufOrgao: orNull(pick(byKey, cols.ufOrgao)),
    fundamentacao: orNull(pick(byKey, cols.fundamentacao)),
    busca: buscaOf(nome, razaoSocial),
  } satisfies SancaoFlat;
};

const mapCeaf = (byKey: Map<string, string>) => {
  const documento = pick(byKey, cols.documento);
  const nome = pick(byKey, cols.nome);
  return {
    lista: "ceaf" as const,
    codigo: orNull(pick(byKey, cols.codigo)),
    tipoPessoa: orNull(pick(byKey, cols.tipoPessoa)),
    documento: orNull(documento),
    docNormalizado: docOf(documento),
    nome: orNull(nome),
    razaoSocial: null,
    categoria: orNull(pick(byKey, cols.categoria)),
    numeroProcesso: orNull(pick(byKey, cols.numeroProcesso)),
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    dataPublicacao: dataBr(pick(byKey, cols.dataPublicacao)),
    orgaoSancionador: orNull(
      pick(byKey, [...cols.orgao, "ORGAO DE LOTACAO"])
    ),
    ufOrgao: orNull(pick(byKey, cols.ufOrgao)),
    fundamentacao: orNull(pick(byKey, cols.fundamentacao)),
    busca: buscaOf(nome, pick(byKey, ["CARGO EFETIVO"])),
  } satisfies SancaoFlat;
};

const mapCepim = (byKey: Map<string, string>) => {
  const documento = pick(byKey, ["CNPJ ENTIDADE", ...cols.documento]);
  const nome = pick(byKey, ["NOME ENTIDADE", ...cols.nome]);
  return {
    lista: "cepim" as const,
    codigo: orNull(pick(byKey, ["NUMERO CONVENIO", ...cols.codigo])),
    tipoPessoa: "J",
    documento: orNull(documento),
    docNormalizado: docOf(documento),
    nome: orNull(nome),
    razaoSocial: null,
    categoria: orNull(pick(byKey, ["MOTIVO DO IMPEDIMENTO"])),
    numeroProcesso: orNull(pick(byKey, ["NUMERO CONVENIO"])),
    valorMulta: null,
    dataInicio: null,
    dataFinal: null,
    dataPublicacao: null,
    orgaoSancionador: orNull(pick(byKey, ["ORGAO CONCEDENTE", ...cols.orgao])),
    ufOrgao: null,
    fundamentacao: orNull(pick(byKey, ["MOTIVO DO IMPEDIMENTO"])),
    busca: buscaOf(nome),
  } satisfies SancaoFlat;
};

const mapAcordo = (byKey: Map<string, string>) => {
  const documento = pick(byKey, ["CNPJ DO SANCIONADO", ...cols.documento]);
  const razaoSocial = pick(byKey, cols.razaoSocial);
  return {
    lista: "acordos-leniencia" as const,
    codigo: orNull(pick(byKey, ["ID DO ACORDO"])),
    tipoPessoa: "J",
    documento: orNull(documento),
    docNormalizado: docOf(documento),
    nome: orNull(razaoSocial),
    razaoSocial: orNull(razaoSocial),
    categoria: orNull(
      pick(byKey, [
        "SITUACAO DO ACORDO DE LENIENICA",
        "SITUACAO DO ACORDO DE LENIENCIA",
      ])
    ),
    numeroProcesso: orNull(pick(byKey, cols.numeroProcesso)),
    valorMulta: null,
    dataInicio: dataBr(pick(byKey, ["DATA DE INICIO DO ACORDO"])),
    dataFinal: dataBr(pick(byKey, ["DATA DE FIM DO ACORDO"])),
    dataPublicacao: null,
    orgaoSancionador: orNull(pick(byKey, cols.orgao)),
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
  Boolean(
    row.codigo || row.documento || row.nome || row.razaoSocial ||
      row.docNormalizado
  );

const mapSancoesImpl = (
  lista: DatasetKey,
  records: readonly Record<string, string>[]
) => {
  const mapper = mapperFor(lista);
  return pipe(
    records,
    Arr.map((record) => mapper(indexByKey(record))),
    Arr.filter(hasContent)
  );
};

export const mapSancoes: {
  (
    records: readonly Record<string, string>[]
  ): (lista: DatasetKey) => ReturnType<typeof mapSancoesImpl>;
  (
    lista: DatasetKey,
    records: readonly Record<string, string>[]
  ): ReturnType<typeof mapSancoesImpl>;
} = dual(2, mapSancoesImpl);

export const SancaoErrorCode = Schema.Literals([
  "sancoes.SNAPSHOT_MISSING",
]);
export type SancaoErrorCode = (typeof SancaoErrorCode)["Type"];

export class SancaoError extends Schema.TaggedError<SancaoError, { readonly brand: unique symbol }>()(
  "SancaoError",
  {
    code: SancaoErrorCode,
    dataset: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "sancoes.SNAPSHOT_MISSING":
        return `Nenhum snapshot da CGU encontrado para ${this.dataset} nos ultimos ${lookbackDays} dias.`;
    }
  }
}
