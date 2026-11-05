import { Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
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
    digits.length === pipe(termo, Str.replace(/[.\-/\s]/g, "")).length
  );
};

export const idFromUri = (uri: string) =>
  pipe(
    uri,
    Str.match(/(\d+)\s*$/),
    Option.flatMap((found) => Arr.get(found, 1)),
    Option.getOrElse(() => "")
  );

const sentinels = new Set(["#NULO#", "#NULO", "-1", "#NE#", "#NI#"]);

const clean = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  return sentinels.has(trimmed) ? "" : trimmed;
};

const pick = (record: Record<string, string>, keys: readonly string[]) =>
  pipe(
    keys,
    Arr.map((key) => pipe(record[key] ?? "", Str.trim)),
    Arr.findFirst((value) => value !== ""),
    Option.getOrElse(() => "")
  );

const field = (record: Record<string, string>, keys: readonly string[]) =>
  clean(pick(record, keys));

const numeroBr = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  const normalized = pipe(trimmed, Str.includes(","))
    ? pipe(trimmed, Str.replace(/\./g, ""), Str.replace(",", "."))
    : trimmed;
  const cleaned = pipe(normalized, Str.replace(/[^\d.\-]/g, ""));
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

const captures = (value: string, pattern: RegExp) =>
  pipe(
    value,
    Str.match(pattern),
    Option.flatMap((found) =>
      Option.all([Arr.get(found, 1), Arr.get(found, 2), Arr.get(found, 3)])
    )
  );

const pad2 = Str.padStart(2, "0");

const dataBr = (value: string) => {
  const trimmed = pipe(value, Str.trim);
  return Match.value(trimmed).pipe(
    Match.when(
      (text) => text === "" || /^0+$/.test(text),
      () => null
    ),
    Match.orElse((text) =>
      pipe(
        captures(text, /^(\d{4})(\d{2})(\d{2})$/),
        Option.map(([y, m, d]) => buildDate(y, m, d)),
        Option.orElse(() =>
          pipe(
            captures(text, /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/),
            Option.map(([d, m, y]) => buildDate(y, pad2(m), pad2(d)))
          )
        ),
        Option.orElse(() =>
          pipe(
            captures(text, /^(\d{4})-(\d{2})-(\d{2})/),
            Option.map(([y, m, d]) => buildDate(y, m, d))
          )
        ),
        Option.getOrElse(() => null)
      )
    )
  );
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
  idLegislaturaInicial: Schema.NullOr(Schema.Finite),
  idLegislaturaFinal: Schema.NullOr(Schema.Finite),
});
export type DeputadoFlat = (typeof DeputadoFlat)["Type"];

export const CotaFlat = Schema.Struct({
  nuDeputadoId: Schema.NullOr(Schema.Finite),
  ideCadastro: Schema.NullOr(Schema.Finite),
  nomeParlamentar: Schema.String,
  cpfDeputado: Schema.String,
  sgUf: Schema.String,
  sgPartido: Schema.String,
  numSubCota: Schema.NullOr(Schema.Finite),
  txtDescricao: Schema.String,
  txtFornecedor: Schema.String,
  cnpjCpf: Schema.String,
  cnpjCpfNorm: Schema.String,
  datEmissao: Schema.String,
  vlrDocumento: Schema.NullOr(Schema.Finite),
  vlrGlosa: Schema.NullOr(Schema.Finite),
  vlrLiquido: Schema.NullOr(Schema.Finite),
  numMes: Schema.NullOr(Schema.Finite),
  numAno: Schema.NullOr(Schema.Finite),
  ideDocumento: Schema.String,
  urlDocumento: Schema.String,
  busca: Schema.String,
});
export type CotaFlat = (typeof CotaFlat)["Type"];

export const ProposicaoFlat = Schema.Struct({
  id: Schema.String,
  uri: Schema.String,
  siglaTipo: Schema.String,
  numero: Schema.NullOr(Schema.Finite),
  ano: Schema.NullOr(Schema.Finite),
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
  proponente: Schema.NullOr(Schema.Finite),
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
  pipe(
    records,
    Arr.map(mapDeputado),
    Arr.filter((row) => row.id !== "")
  );

export const mapCotas = (records: readonly Record<string, string>[]) =>
  pipe(records, Arr.map(mapCota));

export const mapProposicoes = (records: readonly Record<string, string>[]) =>
  pipe(
    records,
    Arr.map(mapProposicao),
    Arr.filter((row) => row.id !== "")
  );

export const mapProposicaoAutores = (
  records: readonly Record<string, string>[]
) =>
  pipe(
    records,
    Arr.map(mapProposicaoAutor),
    Arr.filter((row) => row.idProposicao !== "")
  );

export const passageProposicao = (row: ProposicaoFlat) =>
  pipe(`${row.ementa} ${row.ementaDetalhada} ${row.keywords}`, Str.trim);

export const CamaraErrorCode = Schema.Literals(["camara.MISSING_FILTRO"]);
export type CamaraErrorCode = (typeof CamaraErrorCode)["Type"];

export class CamaraError extends Schema.TaggedError<CamaraError, { readonly brand: unique symbol }>()(
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
