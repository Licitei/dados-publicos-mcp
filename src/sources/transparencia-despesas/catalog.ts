import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import type { DuckTable } from "../../kernel/duck/duck";
import { normalize } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickOne, numeroBr } from "../../kernel/csv/fields";

export const despesaFederalTable: DuckTable = {
  name: "despesa_federal",
  key: "id",
  columns: {
    id: "BIGINT",
    anoMes: "VARCHAR",
    codOrgaoSuperior: "VARCHAR",
    nomeOrgaoSuperior: "VARCHAR",
    codOrgao: "VARCHAR",
    nomeOrgao: "VARCHAR",
    codFuncao: "VARCHAR",
    nomeFuncao: "VARCHAR",
    codPrograma: "VARCHAR",
    nomePrograma: "VARCHAR",
    codAcao: "VARCHAR",
    nomeAcao: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    nomeElemento: "VARCHAR",
    valorEmpenhado: "DOUBLE",
    valorLiquidado: "DOUBLE",
    valorPago: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const cdnBase =
  "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/despesas-execucao";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

export const zipUrl = (anoMes: string) => `${cdnBase}/${anoMes}_Despesas.zip`;

export const toAnoMes = (mes: string) => pipe(mes, Str.replace(/-/g, ""));

const orNull = (value: string) => (value === "" ? null : value);

export const DespesaFederalFlat = Schema.Struct({
  anoMes: Schema.NullOr(Schema.String),
  codOrgaoSuperior: Schema.NullOr(Schema.String),
  nomeOrgaoSuperior: Schema.NullOr(Schema.String),
  codOrgao: Schema.NullOr(Schema.String),
  nomeOrgao: Schema.NullOr(Schema.String),
  codFuncao: Schema.NullOr(Schema.String),
  nomeFuncao: Schema.NullOr(Schema.String),
  codPrograma: Schema.NullOr(Schema.String),
  nomePrograma: Schema.NullOr(Schema.String),
  codAcao: Schema.NullOr(Schema.String),
  nomeAcao: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  municipio: Schema.NullOr(Schema.String),
  nomeElemento: Schema.NullOr(Schema.String),
  valorEmpenhado: Schema.NullOr(Schema.Finite),
  valorLiquidado: Schema.NullOr(Schema.Finite),
  valorPago: Schema.NullOr(Schema.Finite),
  busca: Schema.String,
});
export type DespesaFederalFlat = (typeof DespesaFederalFlat)["Type"];

const mapRecord = (record: CsvRecord) => {
  const byKey = indexByKey(record);
  const nomeOrgaoSuperior = pickOne(byKey, "Nome Orgao Superior");
  const nomeOrgao = pickOne(byKey, "Nome Orgao Subordinado");
  const nomeFuncao = pickOne(byKey, "Nome Funcao");
  const nomePrograma = pickOne(byKey, "Nome Programa Orcamentario");
  const nomeAcao = pickOne(byKey, "Nome Acao");
  const nomeElemento = pickOne(byKey, "Nome Elemento de Despesa");
  return {
    anoMes: orNull(pickOne(byKey, "Ano e mes do lancamento")),
    codOrgaoSuperior: orNull(pickOne(byKey, "Codigo Orgao Superior")),
    nomeOrgaoSuperior: orNull(nomeOrgaoSuperior),
    codOrgao: orNull(pickOne(byKey, "Codigo Orgao Subordinado")),
    nomeOrgao: orNull(nomeOrgao),
    codFuncao: orNull(pickOne(byKey, "Codigo Funcao")),
    nomeFuncao: orNull(nomeFuncao),
    codPrograma: orNull(pickOne(byKey, "Codigo Programa Orcamentario")),
    nomePrograma: orNull(nomePrograma),
    codAcao: orNull(pickOne(byKey, "Codigo Acao")),
    nomeAcao: orNull(nomeAcao),
    uf: orNull(pickOne(byKey, "UF")),
    municipio: orNull(pickOne(byKey, "Municipio")),
    nomeElemento: orNull(nomeElemento),
    valorEmpenhado: numeroBr(pickOne(byKey, "Valor Empenhado (R$)")),
    valorLiquidado: numeroBr(pickOne(byKey, "Valor Liquidado (R$)")),
    valorPago: numeroBr(pickOne(byKey, "Valor Pago (R$)")),
    busca: normalize(
      pipe(
        [nomeAcao, nomePrograma, nomeElemento, nomeOrgaoSuperior, nomeFuncao],
        Arr.filter((part) => part !== ""),
        Arr.join(" ")
      )
    ),
  } satisfies DespesaFederalFlat;
};

export const mapDespesas = (records: readonly CsvRecord[]): readonly DespesaFederalFlat[] =>
  pipe(
    records,
    Arr.map(mapRecord),
    Arr.filter(
      (row) => row.nomeAcao !== null || row.nomePrograma !== null || row.nomeOrgaoSuperior !== null
    )
  );

const DespesaErrorCode = Schema.Literals(["transparencia.MES_MISSING"]);

export class DespesaError extends Schema.TaggedError<
  DespesaError,
  { readonly brand: unique symbol }
>()("DespesaError", {
  code: DespesaErrorCode,
  anoMes: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "transparencia.MES_MISSING":
        return `Despesas do Portal da Transparencia indisponiveis para ${this.anoMes}.`;
    }
  }
}
