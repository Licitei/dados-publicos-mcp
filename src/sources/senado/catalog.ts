import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const senadoresUrl =
  "https://legis.senado.leg.br/dadosabertos/senador/lista/atual";

export const ceapsBase =
  "https://www.senado.leg.br/transparencia/LAI/verba";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const defaultAno = 2025;

export const ceapsUrl = (ano: number) =>
  `${ceapsBase}/despesa_ceaps_${ano}.csv`;

const IdentificacaoRaw = Schema.Struct({
  CodigoParlamentar: Schema.optional(Schema.String),
  NomeParlamentar: Schema.optional(Schema.String),
  NomeCompletoParlamentar: Schema.optional(Schema.String),
  SexoParlamentar: Schema.optional(Schema.String),
  SiglaPartidoParlamentar: Schema.optional(Schema.String),
  UfParlamentar: Schema.optional(Schema.String),
  EmailParlamentar: Schema.optional(Schema.String),
});

const ParlamentarRaw = Schema.Struct({
  IdentificacaoParlamentar: IdentificacaoRaw,
});

export const SenadoresPayload = Schema.Struct({
  ListaParlamentarEmExercicio: Schema.Struct({
    Parlamentares: Schema.Struct({
      Parlamentar: Schema.Array(ParlamentarRaw),
    }),
  }),
});
export type SenadoresPayload = (typeof SenadoresPayload)["Type"];

export const SenadorFlat = Schema.Struct({
  codigo: Schema.NullOr(Schema.String),
  nome: Schema.NullOr(Schema.String),
  nomeCompleto: Schema.NullOr(Schema.String),
  sexo: Schema.NullOr(Schema.String),
  partido: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type SenadorFlat = (typeof SenadorFlat)["Type"];

const orNull = (value: string | undefined) =>
  value === undefined || Str.trim(value) === "" ? null : Str.trim(value);

export const mapSenadores = (
  payload: SenadoresPayload
): readonly SenadorFlat[] =>
  Arr.map(payload.ListaParlamentarEmExercicio.Parlamentares.Parlamentar, (row) => {
    const id = row.IdentificacaoParlamentar;
    return {
      codigo: orNull(id.CodigoParlamentar),
      nome: orNull(id.NomeParlamentar),
      nomeCompleto: orNull(id.NomeCompletoParlamentar),
      sexo: orNull(id.SexoParlamentar),
      partido: orNull(id.SiglaPartidoParlamentar),
      uf: orNull(id.UfParlamentar),
      email: orNull(id.EmailParlamentar),
      busca: normalize(
        pipe(
          [id.NomeParlamentar, id.NomeCompletoParlamentar, id.SiglaPartidoParlamentar],
          Arr.filter((part) => part !== undefined),
          Arr.join(" ")
        )
      ),
    } satisfies SenadorFlat;
  });

export const dropFirstLine = (bytes: Uint8Array) => {
  const newline = bytes.indexOf(0x0a);
  return newline === -1 ? bytes : bytes.slice(newline + 1);
};

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
      Rec.toEntries(record),
      Arr.map(([key, value]) => [headerKey(key), value] as const)
    )
  );

const pick = (byKey: Map<string, string>, candidate: string) =>
  Str.trim(byKey.get(headerKey(candidate)) ?? "");

const numeroBr = (value: string) => {
  const trimmed = Str.trim(value);
  const normalized = Str.includes(",")(trimmed)
    ? pipe(trimmed, Str.replace(/\./g, ""), Str.replace(",", "."))
    : trimmed;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
};

const inteiroOrNull = (value: string) => {
  const parsed = Number(Str.trim(value));
  return Str.trim(value) === "" || !Number.isInteger(parsed) ? null : parsed;
};

const dataBr = (value: string) =>
  pipe(
    value,
    Str.trim,
    Str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),
    Option.flatMap((match) =>
      Option.all([Arr.get(match, 1), Arr.get(match, 2), Arr.get(match, 3)])
    ),
    Option.map(
      ([dia, mes, ano]) =>
        `${ano}-${Str.padStart(2, "0")(mes)}-${Str.padStart(2, "0")(dia)}`
    ),
    Option.getOrNull
  );

export const CeapsFlat = Schema.Struct({
  ano: Schema.NullOr(Schema.Finite),
  mes: Schema.NullOr(Schema.Finite),
  senador: Schema.NullOr(Schema.String),
  tipoDespesa: Schema.NullOr(Schema.String),
  cnpjCpf: Schema.NullOr(Schema.String),
  docNormalizado: Schema.String,
  fornecedor: Schema.NullOr(Schema.String),
  documento: Schema.NullOr(Schema.String),
  data: Schema.NullOr(Schema.String),
  detalhamento: Schema.NullOr(Schema.String),
  valorReembolsado: Schema.NullOr(Schema.Finite),
  codDocumento: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type CeapsFlat = (typeof CeapsFlat)["Type"];

const orNullStr = (value: string) => (value === "" ? null : value);

export const mapCeaps = (
  records: readonly Record<string, string>[]
): readonly CeapsFlat[] =>
  pipe(
    records,
    Arr.map((record) => {
      const byKey = indexByKey(record);
      const cnpjCpf = pick(byKey, "CNPJ_CPF");
      const fornecedor = pick(byKey, "FORNECEDOR");
      const detalhamento = pick(byKey, "DETALHAMENTO");
      const tipoDespesa = pick(byKey, "TIPO_DESPESA");
      return {
        ano: inteiroOrNull(pick(byKey, "ANO")),
        mes: inteiroOrNull(pick(byKey, "MES")),
        senador: orNullStr(pick(byKey, "SENADOR")),
        tipoDespesa: orNullStr(tipoDespesa),
        cnpjCpf: orNullStr(cnpjCpf),
        docNormalizado: onlyDigits(cnpjCpf),
        fornecedor: orNullStr(fornecedor),
        documento: orNullStr(pick(byKey, "DOCUMENTO")),
        data: dataBr(pick(byKey, "DATA")),
        detalhamento: orNullStr(detalhamento),
        valorReembolsado: numeroBr(pick(byKey, "VALOR_REEMBOLSADO")),
        codDocumento: orNullStr(pick(byKey, "COD_DOCUMENTO")),
        busca: normalize(Arr.join([fornecedor, detalhamento, tipoDespesa], " ")),
      } satisfies CeapsFlat;
    }),
    Arr.filter((row) => (row.fornecedor ?? "") !== "" || row.docNormalizado !== "")
  );

export const SenadoErrorCode = Schema.Literals(["senado.CEAPS_MISSING"]);
export type SenadoErrorCode = (typeof SenadoErrorCode)["Type"];

export class SenadoError extends Schema.TaggedError<SenadoError, { readonly brand: unique symbol }>()(
  "SenadoError",
  {
    code: SenadoErrorCode,
    ano: Schema.optional(Schema.Finite),
  }
) {
  override get message() {
    switch (this.code) {
      case "senado.CEAPS_MISSING":
        return `CEAPS do Senado indisponivel para o ano ${this.ano}.`;
    }
  }
}
