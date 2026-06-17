import { Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const cdnBase =
  "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/despesas-execucao";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

export const zipUrl = (anoMes: string) => `${cdnBase}/${anoMes}_Despesas.zip`;

export const toAnoMes = (mes: string) => mes.replace(/-/g, "");

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

const pick = (byKey: Map<string, string>, candidate: string) =>
  (byKey.get(headerKey(candidate)) ?? "").trim();

const orNull = (value: string) => (value === "" ? null : value);

const numeroBr = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
};

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
  valorEmpenhado: Schema.NullOr(Schema.Number),
  valorLiquidado: Schema.NullOr(Schema.Number),
  valorPago: Schema.NullOr(Schema.Number),
  busca: Schema.String,
});
export type DespesaFederalFlat = (typeof DespesaFederalFlat)["Type"];

export const mapDespesas = (
  records: readonly Record<string, string>[]
): readonly DespesaFederalFlat[] =>
  records
    .map((record) => {
      const byKey = indexByKey(record);
      const nomeOrgaoSuperior = pick(byKey, "Nome Orgao Superior");
      const nomeOrgao = pick(byKey, "Nome Orgao Subordinado");
      const nomeFuncao = pick(byKey, "Nome Funcao");
      const nomePrograma = pick(byKey, "Nome Programa Orcamentario");
      const nomeAcao = pick(byKey, "Nome Acao");
      const nomeElemento = pick(byKey, "Nome Elemento de Despesa");
      return {
        anoMes: orNull(pick(byKey, "Ano e mes do lancamento")),
        codOrgaoSuperior: orNull(pick(byKey, "Codigo Orgao Superior")),
        nomeOrgaoSuperior: orNull(nomeOrgaoSuperior),
        codOrgao: orNull(pick(byKey, "Codigo Orgao Subordinado")),
        nomeOrgao: orNull(nomeOrgao),
        codFuncao: orNull(pick(byKey, "Codigo Funcao")),
        nomeFuncao: orNull(nomeFuncao),
        codPrograma: orNull(pick(byKey, "Codigo Programa Orcamentario")),
        nomePrograma: orNull(nomePrograma),
        codAcao: orNull(pick(byKey, "Codigo Acao")),
        nomeAcao: orNull(nomeAcao),
        uf: orNull(pick(byKey, "UF")),
        municipio: orNull(pick(byKey, "Municipio")),
        nomeElemento: orNull(nomeElemento),
        valorEmpenhado: numeroBr(pick(byKey, "Valor Empenhado (R$)")),
        valorLiquidado: numeroBr(pick(byKey, "Valor Liquidado (R$)")),
        valorPago: numeroBr(pick(byKey, "Valor Pago (R$)")),
        busca: normalize(
          [nomeAcao, nomePrograma, nomeElemento, nomeOrgaoSuperior, nomeFuncao]
            .filter((part) => part !== "")
            .join(" ")
        ),
      } satisfies DespesaFederalFlat;
    })
    .filter((row) =>
      Boolean(row.nomeAcao || row.nomePrograma || row.nomeOrgaoSuperior)
    );

export const DespesaErrorCode = Schema.Literals(["transparencia.MES_MISSING"]);
export type DespesaErrorCode = (typeof DespesaErrorCode)["Type"];

export class DespesaError extends Schema.TaggedErrorClass<DespesaError>()(
  "DespesaError",
  {
    code: DespesaErrorCode,
    anoMes: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "transparencia.MES_MISSING":
        return `Despesas do Portal da Transparencia indisponiveis para ${this.anoMes}.`;
    }
  }
}
