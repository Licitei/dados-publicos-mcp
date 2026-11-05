import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize } from "../../kernel/text/normalize";

export const caixaBase =
  "https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais";

export const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

export const ufColumnStart = 5;

const zipUrlImpl = (ano: number, mes: number) =>
  `${caixaBase}/SINAPI-${ano}-${Str.padStart(2, "0")(String(mes))}-formato-xlsx.zip`;

export const zipUrl: {
  (mes: number): (ano: number) => string;
  (ano: number, mes: number): string;
} = dual(2, zipUrlImpl);

const mesReferenciaOfImpl = (ano: number, mes: number) =>
  `${ano}-${Str.padStart(2, "0")(String(mes))}`;

export const mesReferenciaOf: {
  (mes: number): (ano: number) => string;
  (ano: number, mes: number): string;
} = dual(2, mesReferenciaOfImpl);

const norm = (value: string) =>
  pipe(
    value,
    Str.normalize("NFD"),
    Str.replace(/\p{Diacritic}/gu, ""),
    Str.toLowerCase,
    Str.replace(/\s+/g, " "),
    Str.trim
  );

export const referenciaMatcher = (name: string) =>
  /referencia/.test(norm(name)) && /\.xlsx$/i.test(name);

export const isdSheetMatcher = (name: string) => norm(name) === "isd";

const preco = (value: string) => {
  const cleaned = pipe(value, Str.replace(/\*/g, ""), Str.trim);
  const normalized = Str.includes(",")(cleaned)
    ? pipe(cleaned, Str.replace(/\./g, ""), Str.replace(",", "."))
    : cleaned;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
};

export const SinapiInsumoFlat = Schema.Struct({
  mesReferencia: Schema.String,
  codigo: Schema.NullOr(Schema.String),
  descricao: Schema.NullOr(Schema.String),
  unidade: Schema.NullOr(Schema.String),
  origem: Schema.NullOr(Schema.String),
  classificacao: Schema.NullOr(Schema.String),
  uf: Schema.String,
  precoMediano: Schema.Finite,
  busca: Schema.String,
});
export type SinapiInsumoFlat = (typeof SinapiInsumoFlat)["Type"];

const orNull = (value: string) => {
  const trimmed = Str.trim(value);
  return trimmed === "" ? null : trimmed;
};

const cell = (row: readonly string[], index: number) =>
  Option.getOrElse(Arr.get(row, index), () => "");

const flattenRow =
  (
    mesReferencia: string,
    ufColumns: readonly { readonly uf: string; readonly index: number }[]
  ) =>
  (row: readonly string[]) => {
    const codigo = orNull(cell(row, 1));
    const descricao = orNull(cell(row, 2));
    return codigo === null && descricao === null
      ? []
      : Arr.flatMap(ufColumns, (column) => {
          const valor = preco(cell(row, column.index));
          return valor === null
            ? []
            : [
                {
                  mesReferencia,
                  codigo,
                  descricao,
                  unidade: orNull(cell(row, 3)),
                  origem: orNull(cell(row, 4)),
                  classificacao: orNull(cell(row, 0)),
                  uf: column.uf,
                  precoMediano: valor,
                  busca: normalize(descricao ?? ""),
                } satisfies SinapiInsumoFlat,
              ];
        });
  };

const mapInsumosImpl = (
  rows: readonly (readonly string[])[],
  mesReferencia: string
): readonly SinapiInsumoFlat[] =>
  Option.match(
    Arr.findFirstIndex(rows, (row) => norm(cell(row, 0)) === "classificacao"),
    {
      onNone: () => [],
      onSome: (headerIndex) => {
        const header = Option.getOrElse(Arr.get(rows, headerIndex), () => []);
        const ufColumns = pipe(
          Arr.drop(header, ufColumnStart),
          Arr.map((label, offset) => ({
            uf: pipe(label, Str.trim, Str.toUpperCase),
            index: ufColumnStart + offset,
          })),
          Arr.filter((column) => /^[A-Z]{2}$/.test(column.uf))
        );
        return Arr.flatMap(
          Arr.drop(rows, headerIndex + 1),
          flattenRow(mesReferencia, ufColumns)
        );
      },
    }
  );

export const mapInsumos: {
  (
    mesReferencia: string
  ): (rows: readonly (readonly string[])[]) => readonly SinapiInsumoFlat[];
  (
    rows: readonly (readonly string[])[],
    mesReferencia: string
  ): readonly SinapiInsumoFlat[];
} = dual(2, mapInsumosImpl);

export const SinapiErrorCode = Schema.Literals(["sinapi.RELATORIO_MISSING"]);
export type SinapiErrorCode = (typeof SinapiErrorCode)["Type"];

export class SinapiError extends Schema.TaggedError<SinapiError, { readonly brand: unique symbol }>()(
  "SinapiError",
  {
    code: SinapiErrorCode,
    referencia: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "sinapi.RELATORIO_MISSING":
        return `Relatorio SINAPI indisponivel para ${this.referencia}.`;
    }
  }
}
