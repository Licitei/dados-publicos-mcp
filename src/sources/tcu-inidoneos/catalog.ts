import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const baseUrl =
  "https://sites.tcu.gov.br/dados-abertos/inidoneos-irregulares/arquivos";

export const csvOptions = { encoding: "utf-8", delimiter: "|" } as const;

export type DatasetKey =
  | "licitantes-inidoneos"
  | "resp-contas-julgadas"
  | "inabilitados-funcao-publica";

export type DatasetSpec = {
  readonly key: DatasetKey;
  readonly file: string;
  readonly label: string;
};

export const datasets: readonly DatasetSpec[] = [
  {
    key: "licitantes-inidoneos",
    file: "licitantes-inidoneos.csv",
    label: "Licitantes inidoneos (art. 46 da Lei 8.443/92)",
  },
  {
    key: "resp-contas-julgadas",
    file: "resp-contas-julgadas-irregulares.csv",
    label: "Responsaveis com contas julgadas irregulares",
  },
  {
    key: "inabilitados-funcao-publica",
    file: "inabilitados-funcao-publica.csv",
    label: "Inabilitados para a funcao publica",
  },
];

export const fileUrl = (dataset: DatasetSpec) =>
  `${baseUrl}/${dataset.file}`;

const headerKey = (header: string) =>
  header
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const indexByKey = (record: Record<string, string>) =>
  new Map(
    Object.entries(record).map(([key, value]) => [headerKey(key), value])
  );

const pick = (
  byKey: Map<string, string>,
  candidates: readonly string[]
): string => {
  const found = candidates
    .map((candidate) => (byKey.get(headerKey(candidate)) ?? "").trim())
    .find((value) => value !== "");
  return found ?? "";
};

const buildDate = (year: string, month: string, day: string) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  return m < 1 || m > 12 || d < 1 || d > 31 || y < 1
    ? null
    : `${year}-${month}-${day}`;
};

const dataBr = (value: string) => {
  const trimmed = value.trim();
  const slashed = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return trimmed === "" || /^0+$/.test(trimmed)
    ? null
    : slashed
      ? buildDate(
          slashed[3],
          slashed[2].padStart(2, "0"),
          slashed[1].padStart(2, "0")
        )
      : null;
};

export const TcuInidoneoFlat = Schema.Struct({
  lista: Schema.String,
  nome: Schema.NullOr(Schema.String),
  documento: Schema.NullOr(Schema.String),
  docNormalizado: Schema.String,
  processo: Schema.NullOr(Schema.String),
  deliberacao: Schema.NullOr(Schema.String),
  dataTransitoJulgado: Schema.NullOr(Schema.String),
  dataFinal: Schema.NullOr(Schema.String),
  dataAcordao: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  municipio: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type TcuInidoneoFlat = (typeof TcuInidoneoFlat)["Type"];

const orNull = (value: string) => (value === "" ? null : value);

const cols = {
  nome: ["NOME"],
  documento: ["CPF_CNPJ", "CPF"],
  processo: ["PROCESSO"],
  deliberacao: ["DELIBERACAO"],
  transito: ["DATA TRANSITO JULGADO"],
  dataFinal: ["DATA FINAL"],
  acordao: ["DATA ACORDAO"],
  uf: ["UF"],
  municipio: ["MUNICIPIO"],
} as const;

const mapRow = (lista: DatasetKey) => (byKey: Map<string, string>) => {
  const nome = pick(byKey, cols.nome);
  const documento = pick(byKey, cols.documento);
  return {
    lista,
    nome: orNull(nome),
    documento: orNull(documento),
    docNormalizado: onlyDigits(documento),
    processo: orNull(pick(byKey, cols.processo)),
    deliberacao: orNull(pick(byKey, cols.deliberacao)),
    dataTransitoJulgado: dataBr(pick(byKey, cols.transito)),
    dataFinal: dataBr(pick(byKey, cols.dataFinal)),
    dataAcordao: dataBr(pick(byKey, cols.acordao)),
    uf: orNull(pick(byKey, cols.uf)),
    municipio: orNull(pick(byKey, cols.municipio)),
    busca: normalize(nome),
  } satisfies TcuInidoneoFlat;
};

const hasContent = (row: TcuInidoneoFlat) =>
  Boolean(row.nome || row.documento || row.docNormalizado);

export const mapInidoneos = (
  lista: DatasetKey,
  records: readonly Record<string, string>[]
) => records.map((record) => mapRow(lista)(indexByKey(record))).filter(hasContent);

export const TcuErrorCode = Schema.Literals(["tcu.DATASET_MISSING"]);
export type TcuErrorCode = (typeof TcuErrorCode)["Type"];

export class TcuError extends Schema.TaggedErrorClass<TcuError>()("TcuError", {
  code: TcuErrorCode,
  dataset: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "tcu.DATASET_MISSING":
        return `Lista do TCU indisponivel: ${this.dataset}.`;
    }
  }
}
