import { Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickOne, numeroBr, inteiroOrNull, dataBr } from "../../kernel/csv/fields";

export const senadoresUrl = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual";

const ceapsBase = "https://www.senado.leg.br/transparencia/LAI/verba";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const defaultAno = 2025;

export const ceapsUrl = (ano: number) => `${ceapsBase}/despesa_ceaps_${ano}.csv`;

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

export const mapSenadores = (payload: SenadoresPayload): readonly SenadorFlat[] =>
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

export const mapCeaps = (records: readonly CsvRecord[]): readonly CeapsFlat[] =>
  pipe(
    records,
    Arr.map((record) => {
      const byKey = indexByKey(record);
      const cnpjCpf = pickOne(byKey, "CNPJ_CPF");
      const fornecedor = pickOne(byKey, "FORNECEDOR");
      const detalhamento = pickOne(byKey, "DETALHAMENTO");
      const tipoDespesa = pickOne(byKey, "TIPO_DESPESA");
      return {
        ano: inteiroOrNull(pickOne(byKey, "ANO")),
        mes: inteiroOrNull(pickOne(byKey, "MES")),
        senador: orNullStr(pickOne(byKey, "SENADOR")),
        tipoDespesa: orNullStr(tipoDespesa),
        cnpjCpf: orNullStr(cnpjCpf),
        docNormalizado: onlyDigits(cnpjCpf),
        fornecedor: orNullStr(fornecedor),
        documento: orNullStr(pickOne(byKey, "DOCUMENTO")),
        data: dataBr(pickOne(byKey, "DATA")),
        detalhamento: orNullStr(detalhamento),
        valorReembolsado: numeroBr(pickOne(byKey, "VALOR_REEMBOLSADO")),
        codDocumento: orNullStr(pickOne(byKey, "COD_DOCUMENTO")),
        busca: normalize(Arr.join([fornecedor, detalhamento, tipoDespesa], " ")),
      } satisfies CeapsFlat;
    }),
    Arr.filter((row) => (row.fornecedor ?? "") !== "" || row.docNormalizado !== "")
  );

const SenadoErrorCode = Schema.Literals(["senado.CEAPS_MISSING"]);

export class SenadoError extends Schema.TaggedError<
  SenadoError,
  { readonly brand: unique symbol }
>()("SenadoError", {
  code: SenadoErrorCode,
  ano: Schema.optional(Schema.Finite),
}) {
  override get message() {
    switch (this.code) {
      case "senado.CEAPS_MISSING":
        return `CEAPS do Senado indisponivel para o ano ${this.ano}.`;
    }
  }
}
