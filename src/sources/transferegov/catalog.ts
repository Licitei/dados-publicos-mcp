import { Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import type { DuckTable } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickOne, numeroBr, dataBr } from "../../kernel/csv/fields";

export const convenioTable: DuckTable = {
  name: "convenio",
  key: "id",
  columns: {
    id: "BIGINT",
    nrConvenio: "VARCHAR",
    idProposta: "VARCHAR",
    situacao: "VARCHAR",
    dataPublicacao: "VARCHAR",
    vigenciaInicio: "VARCHAR",
    vigenciaFim: "VARCHAR",
    valorGlobal: "DOUBLE",
    valorRepasse: "DOUBLE",
    cnpjProponente: "VARCHAR",
    docNormalizado: "VARCHAR",
    nomeProponente: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    codMunicipioIbge: "VARCHAR",
    orgaoSuperior: "VARCHAR",
    orgao: "VARCHAR",
    objeto: "VARCHAR",
    modalidade: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const repositorioBase = "https://repositorio.dados.gov.br/seges/detru";

export const convenioZipUrl = `${repositorioBase}/siconv_convenio.csv.zip`;
export const propostaZipUrl = `${repositorioBase}/siconv_proposta.csv.zip`;

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

const orNull = (value: string) => (value === "" ? null : value);

const PropostaEnrich = Schema.Struct({
  uf: Schema.NullOr(Schema.String),
  municipio: Schema.NullOr(Schema.String),
  codMunicipioIbge: Schema.NullOr(Schema.String),
  orgaoSuperior: Schema.NullOr(Schema.String),
  orgao: Schema.NullOr(Schema.String),
  modalidade: Schema.NullOr(Schema.String),
  cnpjProponente: Schema.NullOr(Schema.String),
  nomeProponente: Schema.NullOr(Schema.String),
  objeto: Schema.NullOr(Schema.String),
});
export type PropostaEnrich = (typeof PropostaEnrich)["Type"];

export const mapPropostas = (records: readonly CsvRecord[]): Map<string, PropostaEnrich> =>
  new Map(
    Arr.flatMap(records, (record) => {
      const byKey = indexByKey(record);
      const id = pickOne(byKey, "ID_PROPOSTA");
      return id === ""
        ? []
        : [
            [
              id,
              {
                uf: orNull(pickOne(byKey, "UF_PROPONENTE")),
                municipio: orNull(pickOne(byKey, "MUNIC_PROPONENTE")),
                codMunicipioIbge: orNull(pickOne(byKey, "COD_MUNIC_IBGE")),
                orgaoSuperior: orNull(pickOne(byKey, "DESC_ORGAO_SUP")),
                orgao: orNull(pickOne(byKey, "DESC_ORGAO")),
                modalidade: orNull(pickOne(byKey, "MODALIDADE")),
                cnpjProponente: orNull(pickOne(byKey, "IDENTIF_PROPONENTE")),
                nomeProponente: orNull(pickOne(byKey, "NM_PROPONENTE")),
                objeto: orNull(pickOne(byKey, "OBJETO_PROPOSTA")),
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
  docNormalizado: Schema.NullOr(Schema.String),
  ...PropostaEnrich.fields,
  busca: Schema.String,
});
export type ConvenioFlat = (typeof ConvenioFlat)["Type"];

const mapConveniosImpl = (
  records: readonly CsvRecord[],
  propostas: Map<string, PropostaEnrich>
): readonly ConvenioFlat[] =>
  Arr.flatMap(records, (record) => {
    const byKey = indexByKey(record);
    const nrConvenio = pickOne(byKey, "NR_CONVENIO");
    const idProposta = pickOne(byKey, "ID_PROPOSTA");
    const enrich = propostas.get(idProposta);
    return nrConvenio === "" && idProposta === ""
      ? []
      : [
          {
            nrConvenio: orNull(nrConvenio),
            idProposta: orNull(idProposta),
            situacao: orNull(pickOne(byKey, "SIT_CONVENIO")),
            dataPublicacao: dataBr(pickOne(byKey, "DIA_PUBL_CONV")),
            vigenciaInicio: dataBr(pickOne(byKey, "DIA_INIC_VIGENC_CONV")),
            vigenciaFim: dataBr(pickOne(byKey, "DIA_FIM_VIGENC_CONV")),
            valorGlobal: numeroBr(pickOne(byKey, "VL_GLOBAL_CONV")),
            valorRepasse: numeroBr(pickOne(byKey, "VL_REPASSE_CONV")),
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
  ): (records: readonly CsvRecord[]) => readonly ConvenioFlat[];
  (records: readonly CsvRecord[], propostas: Map<string, PropostaEnrich>): readonly ConvenioFlat[];
} = dual(2, mapConveniosImpl);
