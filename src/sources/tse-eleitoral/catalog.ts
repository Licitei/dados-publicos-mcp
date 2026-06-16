import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const cdnBase = "https://cdn.tse.jus.br/estatistica/sead/odsele";

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export type DatasetTipo =
  | "consulta_cand"
  | "bem_candidato"
  | "prestacao_contas";

export const zipUrl = (tipo: DatasetTipo, ano: number) =>
  tipo === "prestacao_contas"
    ? `${cdnBase}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`
    : `${cdnBase}/${tipo}/${tipo}_${ano}.zip`;

export const candidatoFile = /consulta_cand/i;
export const bemFile = /bem_candidato/i;

export const acceptBrasil = (pattern: RegExp) => (name: string) =>
  /_BRASIL\.csv$/i.test(name) && pattern.test(name);

export type TabelaPrestacao = "receita" | "receita_originario" | "despesa";

export const classifyPrestacao = (name: string): TabelaPrestacao | null => {
  const lower = name.toLowerCase();
  return !/_brasil\.csv$/i.test(name)
    ? null
    : lower.includes("receitas_candidatos_doador_originario")
      ? "receita_originario"
      : lower.includes("receitas_candidatos")
        ? "receita"
        : lower.includes("despesas_contratadas")
          ? "despesa"
          : null;
};

export const acceptPrestacao = (name: string) =>
  classifyPrestacao(name) !== null;

export const ehDocumento = (termo: string) => {
  const digits = onlyDigits(termo);
  return (
    digits.length >= 11 &&
    digits.length === termo.replace(/[.\-/\s]/g, "").length
  );
};

const sentinels = new Set(["#NULO#", "#NULO", "-1", "#NE#", "#NI#"]);

const clean = (value: string) => {
  const trimmed = value.trim();
  return sentinels.has(trimmed) ? "" : trimmed;
};

const pick = (record: Record<string, string>, keys: readonly string[]) =>
  keys.map((key) => (record[key] ?? "").trim()).find((value) => value !== "") ??
  "";

const field = (record: Record<string, string>, keys: readonly string[]) =>
  clean(pick(record, keys));

const numeroBr = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const cleaned = normalized.replace(/[^\d.\-]/g, "");
  const parsed = Number(cleaned);
  return cleaned === "" ||
    cleaned === "-" ||
    cleaned === "." ||
    cleaned === "-." ||
    !Number.isFinite(parsed)
    ? null
    : parsed;
};

const intBr = (value: string) => {
  const parsed = numeroBr(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const buildDate = (year: string, month: string, day: string) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  return m < 1 || m > 12 || d < 1 || d > 31 || y < 1
    ? null
    : `${year}-${month}-${day}`;
};

const dataBr = (value: string) => {
  const trimmed = value.trim();
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  const slashed = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return trimmed === "" || /^0+$/.test(trimmed)
    ? null
    : compact
      ? buildDate(compact[1], compact[2], compact[3])
      : slashed
        ? buildDate(
            slashed[3],
            slashed[2].padStart(2, "0"),
            slashed[1].padStart(2, "0")
          )
        : iso
          ? buildDate(iso[1], iso[2], iso[3])
          : null;
};

export const CandidatoFlat = Schema.Struct({
  sqCandidato: Schema.String,
  cpf: Schema.String,
  nome: Schema.String,
  nomeUrna: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Number),
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
export type CandidatoFlat = (typeof CandidatoFlat)["Type"];

export const BemFlat = Schema.Struct({
  sqCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Number),
  ufSigla: Schema.String,
  ordem: Schema.String,
  tipoCodigo: Schema.String,
  tipoDescricao: Schema.String,
  descricao: Schema.String,
  valor: Schema.NullOr(Schema.Number),
});
export type BemFlat = (typeof BemFlat)["Type"];

const mapCandidato = (record: Record<string, string>) => {
  const nome = field(record, ["NM_CANDIDATO"]);
  const nomeUrna = field(record, ["NM_URNA_CANDIDATO"]);
  return {
    sqCandidato: field(record, ["SQ_CANDIDATO"]),
    cpf: onlyDigits(field(record, ["NR_CPF_CANDIDATO"])),
    nome,
    nomeUrna,
    anoEleicao: intBr(pick(record, ["ANO_ELEICAO"])),
    ufSigla: field(record, ["SG_UF"]),
    ueSigla: field(record, ["SG_UE"]),
    cargoCodigo: field(record, ["CD_CARGO"]),
    cargoDescricao: field(record, ["DS_CARGO"]),
    partidoNumero: field(record, ["NR_PARTIDO"]),
    partidoSigla: field(record, ["SG_PARTIDO"]),
    situacaoTurno: field(record, ["DS_SIT_TOT_TURNO"]),
    dataNascimento: dataBr(field(record, ["DT_NASCIMENTO"])) ?? "",
    ocupacao: field(record, ["DS_OCUPACAO"]),
    busca: normalize(`${nome} ${nomeUrna}`),
  } satisfies CandidatoFlat;
};

const mapBem = (record: Record<string, string>) => ({
  sqCandidato: field(record, ["SQ_CANDIDATO"]),
  anoEleicao: intBr(pick(record, ["ANO_ELEICAO"])),
  ufSigla: field(record, ["SG_UF"]),
  ordem: field(record, ["NR_ORDEM_BEM_CANDIDATO", "NR_ORDEM_CANDIDATO"]),
  tipoCodigo: field(record, ["CD_TIPO_BEM_CANDIDATO"]),
  tipoDescricao: field(record, ["DS_TIPO_BEM_CANDIDATO"]),
  descricao: field(record, ["DS_BEM_CANDIDATO"]),
  valor: numeroBr(pick(record, ["VR_BEM_CANDIDATO"])),
}) satisfies BemFlat;

export const mapCandidatos = (records: readonly Record<string, string>[]) =>
  records.map(mapCandidato);

export const mapBens = (records: readonly Record<string, string>[]) =>
  records.map(mapBem);

export const ReceitaFlat = Schema.Struct({
  sqReceita: Schema.String,
  sqCandidato: Schema.String,
  cpfCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Number),
  cpfCnpjDoador: Schema.String,
  nomeDoador: Schema.String,
  nomeDoadorRfb: Schema.String,
  cnaeCodigo: Schema.String,
  cnaeDescricao: Schema.String,
  ufDoador: Schema.String,
  valor: Schema.NullOr(Schema.Number),
  data: Schema.String,
  origem: Schema.String,
  natureza: Schema.String,
  recibo: Schema.String,
  busca: Schema.String,
});
export type ReceitaFlat = (typeof ReceitaFlat)["Type"];

export const DespesaFlat = Schema.Struct({
  sqDespesa: Schema.String,
  sqCandidato: Schema.String,
  cpfCandidato: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Number),
  cpfCnpjForn: Schema.String,
  nomeForn: Schema.String,
  nomeFornRfb: Schema.String,
  cnaeCodigo: Schema.String,
  cnaeDescricao: Schema.String,
  ufForn: Schema.String,
  valor: Schema.NullOr(Schema.Number),
  data: Schema.String,
  descricao: Schema.String,
  documento: Schema.String,
  busca: Schema.String,
});
export type DespesaFlat = (typeof DespesaFlat)["Type"];

export const ReceitaOrigFlat = Schema.Struct({
  sqReceita: Schema.String,
  anoEleicao: Schema.NullOr(Schema.Number),
  cpfCnpjOrig: Schema.String,
  nomeOrig: Schema.String,
  nomeOrigRfb: Schema.String,
  tipoOrig: Schema.String,
  cnaeCodigo: Schema.String,
  valor: Schema.NullOr(Schema.Number),
  data: Schema.String,
});
export type ReceitaOrigFlat = (typeof ReceitaOrigFlat)["Type"];

const mapReceita = (record: Record<string, string>) => {
  const nomeDoador = field(record, ["NM_DOADOR"]);
  const nomeDoadorRfb = field(record, ["NM_DOADOR_RFB"]);
  return {
    sqReceita: field(record, ["SQ_RECEITA"]),
    sqCandidato: field(record, ["SQ_CANDIDATO"]),
    cpfCandidato: onlyDigits(field(record, ["NR_CPF_CANDIDATO"])),
    anoEleicao: intBr(pick(record, ["ANO_ELEICAO"])),
    cpfCnpjDoador: onlyDigits(field(record, ["NR_CPF_CNPJ_DOADOR"])),
    nomeDoador,
    nomeDoadorRfb,
    cnaeCodigo: field(record, ["CD_CNAE_DOADOR"]),
    cnaeDescricao: field(record, ["DS_CNAE_DOADOR"]),
    ufDoador: field(record, ["SG_UF_DOADOR"]),
    valor: numeroBr(pick(record, ["VR_RECEITA"])),
    data: dataBr(field(record, ["DT_RECEITA"])) ?? "",
    origem: field(record, ["DS_ORIGEM_RECEITA"]),
    natureza: field(record, ["DS_NATUREZA_RECEITA"]),
    recibo: field(record, ["NR_RECIBO_DOACAO"]),
    busca: normalize(`${nomeDoador} ${nomeDoadorRfb}`),
  } satisfies ReceitaFlat;
};

const mapDespesa = (record: Record<string, string>) => {
  const nomeForn = field(record, ["NM_FORNECEDOR"]);
  const nomeFornRfb = field(record, ["NM_FORNECEDOR_RFB"]);
  return {
    sqDespesa: field(record, ["SQ_DESPESA"]),
    sqCandidato: field(record, ["SQ_CANDIDATO"]),
    cpfCandidato: onlyDigits(field(record, ["NR_CPF_CANDIDATO"])),
    anoEleicao: intBr(pick(record, ["ANO_ELEICAO"])),
    cpfCnpjForn: onlyDigits(field(record, ["NR_CPF_CNPJ_FORNECEDOR"])),
    nomeForn,
    nomeFornRfb,
    cnaeCodigo: field(record, ["CD_CNAE_FORNECEDOR"]),
    cnaeDescricao: field(record, ["DS_CNAE_FORNECEDOR"]),
    ufForn: field(record, ["SG_UF_FORNECEDOR"]),
    valor: numeroBr(pick(record, ["VR_DESPESA_CONTRATADA"])),
    data: dataBr(field(record, ["DT_DESPESA"])) ?? "",
    descricao: field(record, ["DS_DESPESA"]),
    documento: field(record, ["NR_DOCUMENTO"]),
    busca: normalize(`${nomeForn} ${nomeFornRfb}`),
  } satisfies DespesaFlat;
};

const mapReceitaOriginario = (record: Record<string, string>) => ({
  sqReceita: field(record, ["SQ_RECEITA"]),
  anoEleicao: intBr(pick(record, ["ANO_ELEICAO"])),
  cpfCnpjOrig: onlyDigits(field(record, ["NR_CPF_CNPJ_DOADOR_ORIGINARIO"])),
  nomeOrig: field(record, ["NM_DOADOR_ORIGINARIO"]),
  nomeOrigRfb: field(record, ["NM_DOADOR_ORIGINARIO_RFB"]),
  tipoOrig: field(record, ["DS_TP_DOADOR_ORIGINARIO", "TP_DOADOR_ORIGINARIO"]),
  cnaeCodigo: field(record, ["CD_CNAE_DOADOR_ORIGINARIO"]),
  valor: numeroBr(pick(record, ["VR_RECEITA"])),
  data: dataBr(field(record, ["DT_RECEITA"])) ?? "",
}) satisfies ReceitaOrigFlat;

export const mapReceitas = (records: readonly Record<string, string>[]) =>
  records.map(mapReceita);

export const mapDespesas = (records: readonly Record<string, string>[]) =>
  records.map(mapDespesa);

export const mapReceitasOriginario = (
  records: readonly Record<string, string>[]
) => records.map(mapReceitaOriginario);

export const TseErrorCode = Schema.Literals(["tse.MISSING_IDENTIFIER"]);
export type TseErrorCode = (typeof TseErrorCode)["Type"];

export class TseError extends Schema.TaggedErrorClass<TseError>()("TseError", {
  code: TseErrorCode,
}) {
  override get message() {
    switch (this.code) {
      case "tse.MISSING_IDENTIFIER":
        return "Informe cpf ou sqCandidato para a due diligence do candidato.";
    }
  }
}
