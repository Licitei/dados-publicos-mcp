import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const CEAP_ANO_MAX = 2026;

export const DEPUTADOS_URL =
  "https://dadosabertos.camara.leg.br/arquivos/deputados/csv/deputados.csv";

export const ceapUrl = (ano: number) =>
  `https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;

export const proposicoesUrl = (ano: number) =>
  `https://dadosabertos.camara.leg.br/arquivos/proposicoes/csv/proposicoes-${ano}.csv`;

export const proposicoesAutoresUrl = (ano: number) =>
  `https://dadosabertos.camara.leg.br/arquivos/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

export const ehDocumento = (termo: string) => {
  const digits = onlyDigits(termo);
  return (
    digits.length >= 11 &&
    digits.length === termo.replace(/[.\-/\s]/g, "").length
  );
};

export const idFromUri = (uri: string) => {
  const match = uri.match(/(\d+)\s*$/);
  return match ? match[1] : "";
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
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

export const DeputadoFlat = Schema.Struct({
  id: Schema.String,
  uri: Schema.String,
  nome: Schema.String,
  nomeCivil: Schema.String,
  nomeNorm: Schema.String,
  siglaSexo: Schema.String,
  dataNascimento: Schema.String,
  dataFalecimento: Schema.String,
  ufNascimento: Schema.String,
  municipioNascimento: Schema.String,
  idLegislaturaInicial: Schema.NullOr(Schema.Number),
  idLegislaturaFinal: Schema.NullOr(Schema.Number),
});
export type DeputadoFlat = (typeof DeputadoFlat)["Type"];

export const CotaFlat = Schema.Struct({
  nuDeputadoId: Schema.NullOr(Schema.Number),
  ideCadastro: Schema.NullOr(Schema.Number),
  nomeParlamentar: Schema.String,
  cpfDeputado: Schema.String,
  sgUf: Schema.String,
  sgPartido: Schema.String,
  numSubCota: Schema.NullOr(Schema.Number),
  txtDescricao: Schema.String,
  txtFornecedor: Schema.String,
  cnpjCpf: Schema.String,
  cnpjCpfNorm: Schema.String,
  datEmissao: Schema.String,
  vlrDocumento: Schema.NullOr(Schema.Number),
  vlrGlosa: Schema.NullOr(Schema.Number),
  vlrLiquido: Schema.NullOr(Schema.Number),
  numMes: Schema.NullOr(Schema.Number),
  numAno: Schema.NullOr(Schema.Number),
  ideDocumento: Schema.String,
  urlDocumento: Schema.String,
  busca: Schema.String,
});
export type CotaFlat = (typeof CotaFlat)["Type"];

export const ProposicaoFlat = Schema.Struct({
  id: Schema.String,
  uri: Schema.String,
  siglaTipo: Schema.String,
  numero: Schema.NullOr(Schema.Number),
  ano: Schema.NullOr(Schema.Number),
  ementa: Schema.String,
  ementaDetalhada: Schema.String,
  keywords: Schema.String,
  dataApresentacao: Schema.String,
  situacao: Schema.String,
  ultimoStatusData: Schema.String,
  ultimoStatusOrgao: Schema.String,
  busca: Schema.String,
});
export type ProposicaoFlat = (typeof ProposicaoFlat)["Type"];

export const ProposicaoAutorFlat = Schema.Struct({
  idProposicao: Schema.String,
  idDeputadoAutor: Schema.String,
  uriAutor: Schema.String,
  nomeAutor: Schema.String,
  nomeAutorNorm: Schema.String,
  proponente: Schema.NullOr(Schema.Number),
});
export type ProposicaoAutorFlat = (typeof ProposicaoAutorFlat)["Type"];

const mapDeputado = (record: Record<string, string>) => {
  const uri = field(record, ["uri"]);
  const id = idFromUri(uri) || field(record, ["id"]);
  const nome = field(record, ["nome"]);
  const nomeCivil = field(record, ["nomeCivil"]);
  return {
    id,
    uri,
    nome,
    nomeCivil,
    nomeNorm: normalize(`${nome} ${nomeCivil}`),
    siglaSexo: field(record, ["siglaSexo"]),
    dataNascimento: dataBr(field(record, ["dataNascimento"])) ?? "",
    dataFalecimento: dataBr(field(record, ["dataFalecimento"])) ?? "",
    ufNascimento: field(record, ["ufNascimento"]),
    municipioNascimento: field(record, ["municipioNascimento"]),
    idLegislaturaInicial: intBr(pick(record, ["idLegislaturaInicial"])),
    idLegislaturaFinal: intBr(pick(record, ["idLegislaturaFinal"])),
  } satisfies DeputadoFlat;
};

const mapCota = (record: Record<string, string>) => {
  const txtFornecedor = field(record, ["txtFornecedor"]);
  const cnpjCpf = field(record, ["txtCNPJCPF"]);
  return {
    nuDeputadoId: intBr(pick(record, ["nuDeputadoId"])),
    ideCadastro: intBr(pick(record, ["ideCadastro"])),
    nomeParlamentar: field(record, ["txNomeParlamentar"]),
    cpfDeputado: field(record, ["cpf"]),
    sgUf: field(record, ["sgUF"]),
    sgPartido: field(record, ["sgPartido"]),
    numSubCota: intBr(pick(record, ["numSubCota"])),
    txtDescricao: field(record, ["txtDescricao"]),
    txtFornecedor,
    cnpjCpf,
    cnpjCpfNorm: onlyDigits(cnpjCpf),
    datEmissao: dataBr(field(record, ["datEmissao"])) ?? "",
    vlrDocumento: numeroBr(pick(record, ["vlrDocumento"])),
    vlrGlosa: numeroBr(pick(record, ["vlrGlosa"])),
    vlrLiquido: numeroBr(pick(record, ["vlrLiquido"])),
    numMes: intBr(pick(record, ["numMes"])),
    numAno: intBr(pick(record, ["numAno"])),
    ideDocumento: field(record, ["ideDocumento"]),
    urlDocumento: field(record, ["urlDocumento"]),
    busca: normalize(txtFornecedor),
  } satisfies CotaFlat;
};

const mapProposicao = (record: Record<string, string>) => {
  const id = field(record, ["id"]) || idFromUri(field(record, ["uri"]));
  const ementa = field(record, ["ementa"]);
  const ementaDetalhada = field(record, ["ementaDetalhada"]);
  const keywords = field(record, ["keywords"]);
  return {
    id,
    uri: field(record, ["uri"]),
    siglaTipo: field(record, ["siglaTipo"]),
    numero: intBr(pick(record, ["numero"])),
    ano: intBr(pick(record, ["ano"])),
    ementa,
    ementaDetalhada,
    keywords,
    dataApresentacao: dataBr(field(record, ["dataApresentacao"])) ?? "",
    situacao: field(record, ["ultimoStatus_descricaoSituacao"]),
    ultimoStatusData: field(record, ["ultimoStatus_dataHora"]),
    ultimoStatusOrgao: field(record, ["ultimoStatus_siglaOrgao"]),
    busca: normalize(`${ementa} ${ementaDetalhada} ${keywords}`),
  } satisfies ProposicaoFlat;
};

const mapProposicaoAutor = (record: Record<string, string>) => {
  const nomeAutor = field(record, ["nomeAutor"]);
  return {
    idProposicao:
      field(record, ["idProposicao"]) ||
      idFromUri(field(record, ["uriProposicao"])),
    idDeputadoAutor:
      field(record, ["idDeputadoAutor"]) ||
      idFromUri(field(record, ["uriAutor"])),
    uriAutor: field(record, ["uriAutor"]),
    nomeAutor,
    nomeAutorNorm: normalize(nomeAutor),
    proponente: intBr(pick(record, ["proponente"])),
  } satisfies ProposicaoAutorFlat;
};

export const mapDeputados = (records: readonly Record<string, string>[]) =>
  records.map(mapDeputado).filter((row) => row.id !== "");

export const mapCotas = (records: readonly Record<string, string>[]) =>
  records.map(mapCota);

export const mapProposicoes = (records: readonly Record<string, string>[]) =>
  records.map(mapProposicao).filter((row) => row.id !== "");

export const mapProposicaoAutores = (
  records: readonly Record<string, string>[]
) => records.map(mapProposicaoAutor).filter((row) => row.idProposicao !== "");

export const passageProposicao = (row: ProposicaoFlat) =>
  `${row.ementa} ${row.ementaDetalhada} ${row.keywords}`.trim();

export const CamaraErrorCode = Schema.Literals(["camara.MISSING_FILTRO"]);
export type CamaraErrorCode = (typeof CamaraErrorCode)["Type"];

export class CamaraError extends Schema.TaggedErrorClass<CamaraError>()(
  "CamaraError",
  {
    code: CamaraErrorCode,
  }
) {
  override get message() {
    switch (this.code) {
      case "camara.MISSING_FILTRO":
        return "Informe um nome de fornecedor ou um cnpj/cpf para a busca de gastos.";
    }
  }
}
