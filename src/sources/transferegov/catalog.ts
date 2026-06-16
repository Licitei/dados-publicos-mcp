import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const repositorioBase =
  "https://repositorio.dados.gov.br/seges/detru";

export const convenioZipUrl = `${repositorioBase}/siconv_convenio.csv.zip`;
export const propostaZipUrl = `${repositorioBase}/siconv_proposta.csv.zip`;

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

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

const dataBr = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : null;
};

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
    records.flatMap((record) => {
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
  valorGlobal: Schema.NullOr(Schema.Number),
  valorRepasse: Schema.NullOr(Schema.Number),
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

export const mapConvenios = (
  records: readonly Record<string, string>[],
  propostas: Map<string, PropostaEnrich>
): readonly ConvenioFlat[] =>
  records.flatMap((record) => {
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
            docNormalizado: enrich?.cnpjProponente
              ? onlyDigits(enrich.cnpjProponente)
              : null,
            nomeProponente: enrich?.nomeProponente ?? null,
            uf: enrich?.uf ?? null,
            municipio: enrich?.municipio ?? null,
            codMunicipioIbge: enrich?.codMunicipioIbge ?? null,
            orgaoSuperior: enrich?.orgaoSuperior ?? null,
            orgao: enrich?.orgao ?? null,
            objeto: enrich?.objeto ?? null,
            modalidade: enrich?.modalidade ?? null,
            busca: normalize(
              [enrich?.objeto, enrich?.nomeProponente, enrich?.orgao]
                .filter((part) => part !== null && part !== undefined)
                .join(" ")
            ),
          } satisfies ConvenioFlat,
        ];
  });
