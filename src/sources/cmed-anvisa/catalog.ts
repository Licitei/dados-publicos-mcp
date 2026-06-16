import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const precosPage =
  "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos";

export const arquivosBase =
  "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos";

export const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

export const sheetMatcher = (name: string) => /planilha1/i.test(name);

const conformidadeGov = /xls_conformidade_gov_\d+_\d+\.xlsx/;

export const downloadUrlFromPage = (html: string) => {
  const match = html.match(conformidadeGov);
  return match ? `${arquivosBase}/${match[0]}/@@download/file` : null;
};

const headerKey = (header: string) =>
  normalize(header).replace(/\s+/g, " ").trim();

const buildHeaderMap = (row: readonly string[]) =>
  new Map(row.map((label, index) => [headerKey(label), index]));

const findHeaderIndex = (rows: readonly (readonly string[])[]) =>
  rows.findIndex((row) => headerKey(row[0] ?? "") === "substancia");

const cell = (
  row: readonly string[],
  map: Map<string, number>,
  label: string
) => {
  const index = map.get(headerKey(label));
  return index === undefined ? "" : (row[index] ?? "").trim();
};

const orNull = (value: string) => (value === "" ? null : value);

const preco = (value: string) => {
  const cleaned = value.replace(/\*/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
};

export const MedicamentoFlat = Schema.Struct({
  substancia: Schema.NullOr(Schema.String),
  cnpj: Schema.NullOr(Schema.String),
  docNormalizado: Schema.NullOr(Schema.String),
  laboratorio: Schema.NullOr(Schema.String),
  ggrem: Schema.NullOr(Schema.String),
  registro: Schema.NullOr(Schema.String),
  ean1: Schema.NullOr(Schema.String),
  produto: Schema.NullOr(Schema.String),
  apresentacao: Schema.NullOr(Schema.String),
  classeTerapeutica: Schema.NullOr(Schema.String),
  tarja: Schema.NullOr(Schema.String),
  pfSemImpostos: Schema.NullOr(Schema.Number),
  pmvgSemImpostos: Schema.NullOr(Schema.Number),
  busca: Schema.String,
});
export type MedicamentoFlat = (typeof MedicamentoFlat)["Type"];

export const mapMedicamentos = (
  rows: readonly (readonly string[])[]
): readonly MedicamentoFlat[] => {
  const headerIndex = findHeaderIndex(rows);
  return headerIndex === -1
    ? []
    : (() => {
        const map = buildHeaderMap(rows[headerIndex]);
        return rows
          .slice(headerIndex + 1)
          .map((row) => {
            const substancia = cell(row, map, "SUBSTANCIA");
            const produto = cell(row, map, "PRODUTO");
            const apresentacao = cell(row, map, "APRESENTACAO");
            const laboratorio = cell(row, map, "LABORATORIO");
            const classe = cell(row, map, "CLASSE TERAPEUTICA");
            const cnpj = cell(row, map, "CNPJ");
            return {
              substancia: orNull(substancia),
              cnpj: orNull(cnpj),
              docNormalizado: orNull(onlyDigits(cnpj)),
              laboratorio: orNull(laboratorio),
              ggrem: orNull(cell(row, map, "CODIGO GGREM")),
              registro: orNull(cell(row, map, "REGISTRO")),
              ean1: orNull(cell(row, map, "EAN 1")),
              produto: orNull(produto),
              apresentacao: orNull(apresentacao),
              classeTerapeutica: orNull(classe),
              tarja: orNull(cell(row, map, "TARJA")),
              pfSemImpostos: preco(cell(row, map, "PF Sem Impostos")),
              pmvgSemImpostos: preco(cell(row, map, "PMVG Sem Impostos")),
              busca: normalize(
                [substancia, produto, apresentacao, laboratorio, classe].join(
                  " "
                )
              ),
            } satisfies MedicamentoFlat;
          })
          .filter((row) => Boolean(row.produto || row.substancia));
      })();
};

export const CmedErrorCode = Schema.Literals(["cmed.FILE_NOT_LISTED"]);
export type CmedErrorCode = (typeof CmedErrorCode)["Type"];

export class CmedError extends Schema.TaggedErrorClass<CmedError>()("CmedError", {
  code: CmedErrorCode,
}) {
  override get message() {
    switch (this.code) {
      case "cmed.FILE_NOT_LISTED":
        return "Nao foi possivel localizar a planilha de precos CMED na pagina da ANVISA.";
    }
  }
}
