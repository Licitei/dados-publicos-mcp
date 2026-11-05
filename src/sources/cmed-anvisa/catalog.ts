import { numeroBr } from "../../kernel/csv/fields";
import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const precosPage = "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos";

const arquivosBase = "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos/arquivos";

export const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

export const sheetMatcher = (name: string) => /planilha1/i.test(name);

const conformidadeGov = /xls_conformidade_gov_\d+_\d+\.xlsx/;

export const downloadUrlFromPage = (html: string) =>
  pipe(
    html,
    Str.match(conformidadeGov),
    Option.flatMap(Arr.head),
    Option.match({
      onNone: () => null,
      onSome: (file) => `${arquivosBase}/${file}/@@download/file`,
    })
  );

const headerKey = (header: string) => pipe(normalize(header), Str.replace(/\s+/g, " "), Str.trim);

const buildHeaderMap = (row: readonly string[]) =>
  new Map(
    pipe(
      row,
      Arr.map((label, index) => [headerKey(label), index] as const)
    )
  );

const findHeaderIndex = (rows: readonly (readonly string[])[]) =>
  pipe(
    rows,
    Arr.findFirstIndex((row) => headerKey(row[0] ?? "") === "substancia")
  );

const cell = (row: readonly string[], map: Map<string, number>, label: string) => {
  const index = map.get(headerKey(label));
  return index === undefined ? "" : pipe(row[index] ?? "", Str.trim);
};

const orNull = (value: string) => (value === "" ? null : value);

const MedicamentoFlat = Schema.Struct({
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
  pfSemImpostos: Schema.NullOr(Schema.Finite),
  pmvgSemImpostos: Schema.NullOr(Schema.Finite),
  busca: Schema.String,
});
type MedicamentoFlat = (typeof MedicamentoFlat)["Type"];

const mapRow = (map: Map<string, number>) => (row: readonly string[]) => {
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
    pfSemImpostos: numeroBr(cell(row, map, "PF Sem Impostos")),
    pmvgSemImpostos: numeroBr(cell(row, map, "PMVG Sem Impostos")),
    busca: normalize(pipe([substancia, produto, apresentacao, laboratorio, classe], Arr.join(" "))),
  } satisfies MedicamentoFlat;
};

export const mapMedicamentos = (rows: readonly (readonly string[])[]): readonly MedicamentoFlat[] =>
  pipe(
    findHeaderIndex(rows),
    Option.flatMap((headerIndex) =>
      pipe(
        Arr.get(rows, headerIndex),
        Option.map((header) =>
          pipe(
            rows,
            Arr.drop(headerIndex + 1),
            Arr.map(mapRow(buildHeaderMap(header))),
            Arr.filter((row) => row.produto !== null || row.substancia !== null)
          )
        )
      )
    ),
    Option.getOrElse((): readonly MedicamentoFlat[] => [])
  );

const CmedErrorCode = Schema.Literals(["cmed.FILE_NOT_LISTED"]);
type CmedErrorCode = (typeof CmedErrorCode)["Type"];

export class CmedError extends Schema.TaggedError<CmedError, { readonly brand: unique symbol }>()(
  "CmedError",
  {
    code: CmedErrorCode,
  }
) {
  override get message() {
    switch (this.code) {
      case "cmed.FILE_NOT_LISTED":
        return "Nao foi possivel localizar a planilha de precos CMED na pagina da ANVISA.";
    }
  }
}
