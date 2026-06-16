import { Schema } from "effect";
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
  value === undefined || value.trim() === "" ? null : value.trim();

export const mapSenadores = (
  payload: SenadoresPayload
): readonly SenadorFlat[] =>
  payload.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map((row) => {
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
        [id.NomeParlamentar, id.NomeCompletoParlamentar, id.SiglaPartidoParlamentar]
          .filter((part) => part !== undefined)
          .join(" ")
      ),
    } satisfies SenadorFlat;
  });

export const dropFirstLine = (bytes: Uint8Array) => {
  const newline = bytes.indexOf(0x0a);
  return newline === -1 ? bytes : bytes.slice(newline + 1);
};

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

const numeroBr = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
};

const inteiroOrNull = (value: string) => {
  const parsed = Number(value.trim());
  return value.trim() === "" || !Number.isInteger(parsed) ? null : parsed;
};

const dataBr = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : null;
};

export const CeapsFlat = Schema.Struct({
  ano: Schema.NullOr(Schema.Number),
  mes: Schema.NullOr(Schema.Number),
  senador: Schema.NullOr(Schema.String),
  tipoDespesa: Schema.NullOr(Schema.String),
  cnpjCpf: Schema.NullOr(Schema.String),
  docNormalizado: Schema.String,
  fornecedor: Schema.NullOr(Schema.String),
  documento: Schema.NullOr(Schema.String),
  data: Schema.NullOr(Schema.String),
  detalhamento: Schema.NullOr(Schema.String),
  valorReembolsado: Schema.NullOr(Schema.Number),
  codDocumento: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type CeapsFlat = (typeof CeapsFlat)["Type"];

const orNullStr = (value: string) => (value === "" ? null : value);

export const mapCeaps = (
  records: readonly Record<string, string>[]
): readonly CeapsFlat[] =>
  records
    .map((record) => {
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
        busca: normalize([fornecedor, detalhamento, tipoDespesa].join(" ")),
      } satisfies CeapsFlat;
    })
    .filter((row) => Boolean(row.fornecedor || row.docNormalizado));

export const SenadoErrorCode = Schema.Literals(["senado.CEAPS_MISSING"]);
export type SenadoErrorCode = (typeof SenadoErrorCode)["Type"];

export class SenadoError extends Schema.TaggedErrorClass<SenadoError>()(
  "SenadoError",
  {
    code: SenadoErrorCode,
    ano: Schema.optional(Schema.Number),
  }
) {
  override get message() {
    switch (this.code) {
      case "senado.CEAPS_MISSING":
        return `CEAPS do Senado indisponivel para o ano ${this.ano}.`;
    }
  }
}
