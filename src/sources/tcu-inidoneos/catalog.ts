import { Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import type { DuckTable } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickFirst, dataBr } from "../../kernel/csv/fields";

export const tcuInidoneoTable: DuckTable = {
  name: "tcu_inidoneo",
  key: "id",
  columns: {
    id: "BIGINT",
    lista: "VARCHAR",
    nome: "VARCHAR",
    documento: "VARCHAR",
    docNormalizado: "VARCHAR",
    processo: "VARCHAR",
    deliberacao: "VARCHAR",
    dataTransitoJulgado: "VARCHAR",
    dataFinal: "VARCHAR",
    dataAcordao: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const baseUrl = "https://sites.tcu.gov.br/dados-abertos/inidoneos-irregulares/arquivos";

export const csvOptions = { encoding: "utf-8", delimiter: "|" } as const;

const DatasetKey = Schema.Literals([
  "licitantes-inidoneos",
  "resp-contas-julgadas",
  "inabilitados-funcao-publica",
]);
export type DatasetKey = (typeof DatasetKey)["Type"];

const DatasetSpec = Schema.Struct({
  key: DatasetKey,
  file: Schema.String,
  label: Schema.String,
});
export type DatasetSpec = (typeof DatasetSpec)["Type"];

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

export const fileUrl = (dataset: DatasetSpec) => `${baseUrl}/${dataset.file}`;

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
  const nome = pickFirst(byKey, cols.nome);
  const documento = pickFirst(byKey, cols.documento);
  return {
    lista,
    nome: orNull(nome),
    documento: orNull(documento),
    docNormalizado: onlyDigits(documento),
    processo: orNull(pickFirst(byKey, cols.processo)),
    deliberacao: orNull(pickFirst(byKey, cols.deliberacao)),
    dataTransitoJulgado: dataBr(pickFirst(byKey, cols.transito)),
    dataFinal: dataBr(pickFirst(byKey, cols.dataFinal)),
    dataAcordao: dataBr(pickFirst(byKey, cols.acordao)),
    uf: orNull(pickFirst(byKey, cols.uf)),
    municipio: orNull(pickFirst(byKey, cols.municipio)),
    busca: normalize(nome),
  } satisfies TcuInidoneoFlat;
};

const hasContent = (row: TcuInidoneoFlat) =>
  row.nome !== null || row.documento !== null || row.docNormalizado !== "";

const mapInidoneosImpl = (lista: DatasetKey, records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapRow(lista)(indexByKey(record))),
    Arr.filter(hasContent)
  );

export const mapInidoneos: {
  (records: readonly CsvRecord[]): (lista: DatasetKey) => readonly TcuInidoneoFlat[];
  (lista: DatasetKey, records: readonly CsvRecord[]): readonly TcuInidoneoFlat[];
} = dual(2, mapInidoneosImpl);

const TcuErrorCode = Schema.Literals(["tcu.DATASET_MISSING"]);

export class TcuError extends Schema.TaggedError<TcuError, { readonly brand: unique symbol }>()(
  "TcuError",
  {
    code: TcuErrorCode,
    dataset: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "tcu.DATASET_MISSING":
        return `Lista do TCU indisponivel: ${this.dataset}.`;
    }
  }
}
