import { Schema } from "effect";
import { normalize } from "../../kernel/text/normalize";

export const caixaBase =
  "https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais";

export const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

export const ufColumnStart = 5;

export const zipUrl = (ano: number, mes: number) =>
  `${caixaBase}/SINAPI-${ano}-${String(mes).padStart(2, "0")}-formato-xlsx.zip`;

export const mesReferenciaOf = (ano: number, mes: number) =>
  `${ano}-${String(mes).padStart(2, "0")}`;

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const referenciaMatcher = (name: string) =>
  /referencia/.test(norm(name)) && /\.xlsx$/i.test(name);

export const isdSheetMatcher = (name: string) => norm(name) === "isd";

const preco = (value: string) => {
  const cleaned = value.replace(/\*/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
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
  precoMediano: Schema.Number,
  busca: Schema.String,
});
export type SinapiInsumoFlat = (typeof SinapiInsumoFlat)["Type"];

const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const findHeaderIndex = (rows: readonly (readonly string[])[]) =>
  rows.findIndex((row) => norm(row[0] ?? "") === "classificacao");

export const mapInsumos = (
  rows: readonly (readonly string[])[],
  mesReferencia: string
): readonly SinapiInsumoFlat[] => {
  const headerIndex = findHeaderIndex(rows);
  return headerIndex === -1
    ? []
    : (() => {
        const header = rows[headerIndex];
        const ufColumns = header
          .slice(ufColumnStart)
          .map((label, offset) => ({
            uf: label.trim().toUpperCase(),
            index: ufColumnStart + offset,
          }))
          .filter((column) => /^[A-Z]{2}$/.test(column.uf));
        return rows.slice(headerIndex + 1).flatMap((row) => {
          const codigo = orNull(row[1] ?? "");
          const descricao = orNull(row[2] ?? "");
          return codigo === null && descricao === null
            ? []
            : ufColumns.flatMap((column) => {
                const valor = preco(row[column.index] ?? "");
                return valor === null
                  ? []
                  : [
                      {
                        mesReferencia,
                        codigo,
                        descricao,
                        unidade: orNull(row[3] ?? ""),
                        origem: orNull(row[4] ?? ""),
                        classificacao: orNull(row[0] ?? ""),
                        uf: column.uf,
                        precoMediano: valor,
                        busca: normalize(descricao ?? ""),
                      } satisfies SinapiInsumoFlat,
                    ];
              });
        });
      })();
};

export const SinapiErrorCode = Schema.Literals(["sinapi.RELATORIO_MISSING"]);
export type SinapiErrorCode = (typeof SinapiErrorCode)["Type"];

export class SinapiError extends Schema.TaggedErrorClass<SinapiError>()(
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
