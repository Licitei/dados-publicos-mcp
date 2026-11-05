import { Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import type { CsvRecord } from "../../kernel/csv/parse";
import {
  type HeaderIndex,
  indexByKey,
  pickFirst,
  numeroBr,
  intBr,
  dataBr,
  pickClean,
} from "../../kernel/csv/fields";

const cdnBase = "https://cdn.tse.jus.br/estatistica/sead/odsele";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

type DatasetTipo = "consulta_cand" | "bem_candidato" | "prestacao_contas";

export const zipUrl: {
  (ano: number): (tipo: DatasetTipo) => string;
  (tipo: DatasetTipo, ano: number): string;
} = dual(2, (tipo: DatasetTipo, ano: number) =>
  tipo === "prestacao_contas"
    ? `${cdnBase}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`
    : `${cdnBase}/${tipo}/${tipo}_${ano}.zip`
);

export const candidatoFile = /consulta_cand/i;
export const bemFile = /bem_candidato/i;

export const acceptBrasil = (pattern: RegExp) => (name: string) =>
  /_BRASIL\.csv$/i.test(name) && pattern.test(name);

type TabelaPrestacao = "receita" | "receita_originario" | "despesa";

export const classifyPrestacao = (name: string): TabelaPrestacao | null => {
  const lower = Str.toLowerCase(name);
  return !/_brasil\.csv$/i.test(name)
    ? null
    : Str.includes("receitas_candidatos_doador_originario")(lower)
      ? "receita_originario"
      : Str.includes("receitas_candidatos")(lower)
        ? "receita"
        : Str.includes("despesas_contratadas")(lower)
          ? "despesa"
          : null;
};

export const acceptPrestacao = (name: string) => classifyPrestacao(name) !== null;

const CandidatoFlat = Schema.Struct({
  sqCandidato: Schema.String,
  cpf: Schema.String,
  nome: Schema.String,
  nomeUrna: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  ufSigla: Schema.String,
  ueSigla: Schema.String,
  cargoCodigo: Schema.String,
  cargoDescricao: Schema.String,
  partidoNumero: Schema.String,
  partidoSigla: Schema.String,
  situacaoTurno: Schema.String,
  dataNascimento: Schema.String,
  ocupacao: Schema.String,
  busca: Schema.String,
});
type CandidatoFlat = (typeof CandidatoFlat)["Type"];

const BemFlat = Schema.Struct({
  sqCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  ufSigla: Schema.String,
  ordem: Schema.String,
  tipoCodigo: Schema.String,
  tipoDescricao: Schema.String,
  descricao: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
});
type BemFlat = (typeof BemFlat)["Type"];

const mapCandidato = (byKey: HeaderIndex) => {
  const nome = pickClean(byKey, ["NM_CANDIDATO"]);
  const nomeUrna = pickClean(byKey, ["NM_URNA_CANDIDATO"]);
  return {
    sqCandidato: pickClean(byKey, ["SQ_CANDIDATO"]),
    cpf: onlyDigits(pickClean(byKey, ["NR_CPF_CANDIDATO"])),
    nome,
    nomeUrna,
    anoEleicao: intBr(pickFirst(byKey, ["ANO_ELEICAO"])),
    ufSigla: pickClean(byKey, ["SG_UF"]),
    ueSigla: pickClean(byKey, ["SG_UE"]),
    cargoCodigo: pickClean(byKey, ["CD_CARGO"]),
    cargoDescricao: pickClean(byKey, ["DS_CARGO"]),
    partidoNumero: pickClean(byKey, ["NR_PARTIDO"]),
    partidoSigla: pickClean(byKey, ["SG_PARTIDO"]),
    situacaoTurno: pickClean(byKey, ["DS_SIT_TOT_TURNO"]),
    dataNascimento: dataBr(pickClean(byKey, ["DT_NASCIMENTO"])) ?? "",
    ocupacao: pickClean(byKey, ["DS_OCUPACAO"]),
    busca: normalize(`${nome} ${nomeUrna}`),
  } satisfies CandidatoFlat;
};

const mapBem = (byKey: HeaderIndex) =>
  ({
    sqCandidato: pickClean(byKey, ["SQ_CANDIDATO"]),
    anoEleicao: intBr(pickFirst(byKey, ["ANO_ELEICAO"])),
    ufSigla: pickClean(byKey, ["SG_UF"]),
    ordem: pickClean(byKey, ["NR_ORDEM_BEM_CANDIDATO", "NR_ORDEM_CANDIDATO"]),
    tipoCodigo: pickClean(byKey, ["CD_TIPO_BEM_CANDIDATO"]),
    tipoDescricao: pickClean(byKey, ["DS_TIPO_BEM_CANDIDATO"]),
    descricao: pickClean(byKey, ["DS_BEM_CANDIDATO"]),
    valor: numeroBr(pickFirst(byKey, ["VR_BEM_CANDIDATO"])),
  }) satisfies BemFlat;

export const mapCandidatos = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapCandidato(indexByKey(record)))
  );

export const mapBens = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapBem(indexByKey(record)))
  );

const ReceitaFlat = Schema.Struct({
  sqReceita: Schema.String,
  sqCandidato: Schema.String,
  cpfCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  cpfCnpjDoador: Schema.String,
  nomeDoador: Schema.String,
  nomeDoadorRfb: Schema.String,
  cnaeCodigo: Schema.String,
  cnaeDescricao: Schema.String,
  ufDoador: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  data: Schema.String,
  origem: Schema.String,
  natureza: Schema.String,
  recibo: Schema.String,
  busca: Schema.String,
});
type ReceitaFlat = (typeof ReceitaFlat)["Type"];

const DespesaFlat = Schema.Struct({
  sqDespesa: Schema.String,
  sqCandidato: Schema.String,
  cpfCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  cpfCnpjForn: Schema.String,
  nomeForn: Schema.String,
  nomeFornRfb: Schema.String,
  cnaeCodigo: Schema.String,
  cnaeDescricao: Schema.String,
  ufForn: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  data: Schema.String,
  descricao: Schema.String,
  documento: Schema.String,
  busca: Schema.String,
});
type DespesaFlat = (typeof DespesaFlat)["Type"];

const ReceitaOrigFlat = Schema.Struct({
  sqReceita: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Finite),
  cpfCnpjOrig: Schema.String,
  nomeOrig: Schema.String,
  nomeOrigRfb: Schema.String,
  tipoOrig: Schema.String,
  cnaeCodigo: Schema.String,
  valor: Schema.NullOr(Schema.Finite),
  data: Schema.String,
});
type ReceitaOrigFlat = (typeof ReceitaOrigFlat)["Type"];

const mapReceita = (byKey: HeaderIndex) => {
  const nomeDoador = pickClean(byKey, ["NM_DOADOR"]);
  const nomeDoadorRfb = pickClean(byKey, ["NM_DOADOR_RFB"]);
  return {
    sqReceita: pickClean(byKey, ["SQ_RECEITA"]),
    sqCandidato: pickClean(byKey, ["SQ_CANDIDATO"]),
    cpfCandidato: onlyDigits(pickClean(byKey, ["NR_CPF_CANDIDATO"])),
    anoEleicao: intBr(pickFirst(byKey, ["ANO_ELEICAO"])),
    cpfCnpjDoador: onlyDigits(pickClean(byKey, ["NR_CPF_CNPJ_DOADOR"])),
    nomeDoador,
    nomeDoadorRfb,
    cnaeCodigo: pickClean(byKey, ["CD_CNAE_DOADOR"]),
    cnaeDescricao: pickClean(byKey, ["DS_CNAE_DOADOR"]),
    ufDoador: pickClean(byKey, ["SG_UF_DOADOR"]),
    valor: numeroBr(pickFirst(byKey, ["VR_RECEITA"])),
    data: dataBr(pickClean(byKey, ["DT_RECEITA"])) ?? "",
    origem: pickClean(byKey, ["DS_ORIGEM_RECEITA"]),
    natureza: pickClean(byKey, ["DS_NATUREZA_RECEITA"]),
    recibo: pickClean(byKey, ["NR_RECIBO_DOACAO"]),
    busca: normalize(`${nomeDoador} ${nomeDoadorRfb}`),
  } satisfies ReceitaFlat;
};

const mapDespesa = (byKey: HeaderIndex) => {
  const nomeForn = pickClean(byKey, ["NM_FORNECEDOR"]);
  const nomeFornRfb = pickClean(byKey, ["NM_FORNECEDOR_RFB"]);
  return {
    sqDespesa: pickClean(byKey, ["SQ_DESPESA"]),
    sqCandidato: pickClean(byKey, ["SQ_CANDIDATO"]),
    cpfCandidato: onlyDigits(pickClean(byKey, ["NR_CPF_CANDIDATO"])),
    anoEleicao: intBr(pickFirst(byKey, ["ANO_ELEICAO"])),
    cpfCnpjForn: onlyDigits(pickClean(byKey, ["NR_CPF_CNPJ_FORNECEDOR"])),
    nomeForn,
    nomeFornRfb,
    cnaeCodigo: pickClean(byKey, ["CD_CNAE_FORNECEDOR"]),
    cnaeDescricao: pickClean(byKey, ["DS_CNAE_FORNECEDOR"]),
    ufForn: pickClean(byKey, ["SG_UF_FORNECEDOR"]),
    valor: numeroBr(pickFirst(byKey, ["VR_DESPESA_CONTRATADA"])),
    data: dataBr(pickClean(byKey, ["DT_DESPESA"])) ?? "",
    descricao: pickClean(byKey, ["DS_DESPESA"]),
    documento: pickClean(byKey, ["NR_DOCUMENTO"]),
    busca: normalize(`${nomeForn} ${nomeFornRfb}`),
  } satisfies DespesaFlat;
};

const mapReceitaOriginario = (byKey: HeaderIndex) =>
  ({
    sqReceita: pickClean(byKey, ["SQ_RECEITA"]),
    anoEleicao: intBr(pickFirst(byKey, ["ANO_ELEICAO"])),
    cpfCnpjOrig: onlyDigits(pickClean(byKey, ["NR_CPF_CNPJ_DOADOR_ORIGINARIO"])),
    nomeOrig: pickClean(byKey, ["NM_DOADOR_ORIGINARIO"]),
    nomeOrigRfb: pickClean(byKey, ["NM_DOADOR_ORIGINARIO_RFB"]),
    tipoOrig: pickClean(byKey, ["DS_TP_DOADOR_ORIGINARIO", "TP_DOADOR_ORIGINARIO"]),
    cnaeCodigo: pickClean(byKey, ["CD_CNAE_DOADOR_ORIGINARIO"]),
    valor: numeroBr(pickFirst(byKey, ["VR_RECEITA"])),
    data: dataBr(pickClean(byKey, ["DT_RECEITA"])) ?? "",
  }) satisfies ReceitaOrigFlat;

export const mapReceitas = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapReceita(indexByKey(record)))
  );

export const mapDespesas = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapDespesa(indexByKey(record)))
  );

export const mapReceitasOriginario = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapReceitaOriginario(indexByKey(record)))
  );
