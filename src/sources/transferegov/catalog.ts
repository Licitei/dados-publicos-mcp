import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const repositorioBase =
  "https://repositorio.dados.gov.br/seges/detru";

export const convenioZipUrl = `${repositorioBase}/siconv_convenio.csv.zip`;
export const propostaZipUrl = `${repositorioBase}/siconv_proposta.csv.zip`;

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

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

const orNull = (value: string) => (value === "" ? null : value);

const numeroBr = (value: string) => {
  const trimmed = Str.trim(value);
  const normalized = Str.includes(",")(trimmed)
    ? pipe(trimmed, Str.replace(/\./g, ""), Str.replace(",", "."))
    : trimmed;
  const parsed = Number(normalized);
  return normalized === "" || !Number.isFinite(parsed) ? null : parsed;
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

export type PropostaEnrich = {
  readonly uf: string | null;
  readonly municipio: string | null;
  readonly codMunicipioIbge: string | null;
  readonly orgaoSuperior: string | null;
  readonly orgao: string | null;
  readonly modalidade: string | null;
  readonly cnpjProponente: string | null;
  readonly nomeProponente: string | null;
  readonly objeto: string | null;
};

export const mapPropostas = (
  records: readonly Record<string, string>[]
): Map<string, PropostaEnrich> =>
  new Map(
    Arr.flatMap(records, (record) => {
      const byKey = indexByKey(record);
      const id = pick(byKey, "ID_PROPOSTA");
      return id === ""
        ? []
        : [
            [
              id,
              {
                uf: orNull(pick(byKey, "UF_PROPONENTE")),
                municipio: orNull(pick(byKey, "MUNIC_PROPONENTE")),
                codMunicipioIbge: orNull(pick(byKey, "COD_MUNIC_IBGE")),
                orgaoSuperior: orNull(pick(byKey, "DESC_ORGAO_SUP")),
                orgao: orNull(pick(byKey, "DESC_ORGAO")),
                modalidade: orNull(pick(byKey, "MODALIDADE")),
                cnpjProponente: orNull(pick(byKey, "IDENTIF_PROPONENTE")),
                nomeProponente: orNull(pick(byKey, "NM_PROPONENTE")),
                objeto: orNull(pick(byKey, "OBJETO_PROPOSTA")),
              },
            ] as const,
          ];
    })
  );

export const ConvenioFlat = Schema.Struct({
  nrConvenio: Schema.NullOr(Schema.String),
  idProposta: Schema.NullOr(Schema.String),
  situacao: Schema.NullOr(Schema.String),
  dataPublicacao: Schema.NullOr(Schema.String),
  vigenciaInicio: Schema.NullOr(Schema.String),
  vigenciaFim: Schema.NullOr(Schema.String),
  valorGlobal: Schema.NullOr(Schema.Finite),
  valorRepasse: Schema.NullOr(Schema.Finite),
  cnpjProponente: Schema.NullOr(Schema.String),
  docNormalizado: Schema.NullOr(Schema.String),
  nomeProponente: Schema.NullOr(Schema.String),
  uf: Schema.NullOr(Schema.String),
  municipio: Schema.NullOr(Schema.String),
  codMunicipioIbge: Schema.NullOr(Schema.String),
  orgaoSuperior: Schema.NullOr(Schema.String),
  orgao: Schema.NullOr(Schema.String),
  objeto: Schema.NullOr(Schema.String),
  modalidade: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type ConvenioFlat = (typeof ConvenioFlat)["Type"];

const mapConveniosImpl = (
  records: readonly Record<string, string>[],
  propostas: Map<string, PropostaEnrich>
): readonly ConvenioFlat[] =>
  Arr.flatMap(records, (record) => {
    const byKey = indexByKey(record);
    const nrConvenio = pick(byKey, "NR_CONVENIO");
    const idProposta = pick(byKey, "ID_PROPOSTA");
    const enrich = propostas.get(idProposta);
    return nrConvenio === "" && idProposta === ""
      ? []
      : [
          {
            nrConvenio: orNull(nrConvenio),
            idProposta: orNull(idProposta),
            situacao: orNull(pick(byKey, "SIT_CONVENIO")),
            dataPublicacao: dataBr(pick(byKey, "DIA_PUBL_CONV")),
            vigenciaInicio: dataBr(pick(byKey, "DIA_INIC_VIGENC_CONV")),
            vigenciaFim: dataBr(pick(byKey, "DIA_FIM_VIGENC_CONV")),
            valorGlobal: numeroBr(pick(byKey, "VL_GLOBAL_CONV")),
            valorRepasse: numeroBr(pick(byKey, "VL_REPASSE_CONV")),
            cnpjProponente: enrich?.cnpjProponente ?? null,
            docNormalizado:
              enrich?.cnpjProponente === null || enrich?.cnpjProponente === undefined
                ? null
                : onlyDigits(enrich.cnpjProponente),
            nomeProponente: enrich?.nomeProponente ?? null,
            uf: enrich?.uf ?? null,
            municipio: enrich?.municipio ?? null,
            codMunicipioIbge: enrich?.codMunicipioIbge ?? null,
            orgaoSuperior: enrich?.orgaoSuperior ?? null,
            orgao: enrich?.orgao ?? null,
            objeto: enrich?.objeto ?? null,
            modalidade: enrich?.modalidade ?? null,
            busca: normalize(
              pipe(
                [enrich?.objeto, enrich?.nomeProponente, enrich?.orgao],
                Arr.filter((part) => part !== null && part !== undefined),
                Arr.join(" ")
              )
            ),
          } satisfies ConvenioFlat,
        ];
  });

export const mapConvenios: {
  (
    propostas: Map<string, PropostaEnrich>
  ): (records: readonly Record<string, string>[]) => readonly ConvenioFlat[];
  (
    records: readonly Record<string, string>[],
    propostas: Map<string, PropostaEnrich>
  ): readonly ConvenioFlat[];
} = dual(2, mapConveniosImpl);
