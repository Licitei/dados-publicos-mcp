import { Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
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

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const CEAP_ANO_MAX = 2026;

export const DEPUTADOS_URL =
  "https://dadosabertos.camara.leg.br/arquivos/deputados/csv/deputados.csv";

export const ceapUrl = (ano: number) => `https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;

export const proposicoesUrl = (ano: number) =>
  `https://dadosabertos.camara.leg.br/arquivos/proposicoes/csv/proposicoes-${ano}.csv`;

export const proposicoesAutoresUrl = (ano: number) =>
  `https://dadosabertos.camara.leg.br/arquivos/proposicoesAutores/csv/proposicoesAutores-${ano}.csv`;

export const acceptCsv = (name: string) => /\.csv$/i.test(name);

const idFromUri = (uri: string) =>
  pipe(
    uri,
    Str.match(/(\d+)\s*$/),
    Option.flatMap((found) => Arr.get(found, 1)),
    Option.getOrElse(() => "")
  );

const DeputadoFlat = Schema.Struct({
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
type DeputadoFlat = (typeof DeputadoFlat)["Type"];

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

const mapDeputado = (byKey: HeaderIndex) => {
  const uri = pickClean(byKey, ["uri"]);
  const id = idFromUri(uri) || pickClean(byKey, ["id"]);
  const nome = pickClean(byKey, ["nome"]);
  const nomeCivil = pickClean(byKey, ["nomeCivil"]);
  return {
    id,
    uri,
    nome,
    nomeCivil,
    nomeNorm: normalize(`${nome} ${nomeCivil}`),
    siglaSexo: pickClean(byKey, ["siglaSexo"]),
    dataNascimento: dataBr(pickClean(byKey, ["dataNascimento"])) ?? "",
    dataFalecimento: dataBr(pickClean(byKey, ["dataFalecimento"])) ?? "",
    ufNascimento: pickClean(byKey, ["ufNascimento"]),
    municipioNascimento: pickClean(byKey, ["municipioNascimento"]),
    idLegislaturaInicial: intBr(pickFirst(byKey, ["idLegislaturaInicial"])),
    idLegislaturaFinal: intBr(pickFirst(byKey, ["idLegislaturaFinal"])),
  } satisfies DeputadoFlat;
};

const mapCota = (byKey: HeaderIndex) => {
  const txtFornecedor = pickClean(byKey, ["txtFornecedor"]);
  const cnpjCpf = pickClean(byKey, ["txtCNPJCPF"]);
  return {
    nuDeputadoId: intBr(pickFirst(byKey, ["nuDeputadoId"])),
    ideCadastro: intBr(pickFirst(byKey, ["ideCadastro"])),
    nomeParlamentar: pickClean(byKey, ["txNomeParlamentar"]),
    cpfDeputado: pickClean(byKey, ["cpf"]),
    sgUf: pickClean(byKey, ["sgUF"]),
    sgPartido: pickClean(byKey, ["sgPartido"]),
    numSubCota: intBr(pickFirst(byKey, ["numSubCota"])),
    txtDescricao: pickClean(byKey, ["txtDescricao"]),
    txtFornecedor,
    cnpjCpf,
    cnpjCpfNorm: onlyDigits(cnpjCpf),
    datEmissao: dataBr(pickClean(byKey, ["datEmissao"])) ?? "",
    vlrDocumento: numeroBr(pickFirst(byKey, ["vlrDocumento"])),
    vlrGlosa: numeroBr(pickFirst(byKey, ["vlrGlosa"])),
    vlrLiquido: numeroBr(pickFirst(byKey, ["vlrLiquido"])),
    numMes: intBr(pickFirst(byKey, ["numMes"])),
    numAno: intBr(pickFirst(byKey, ["numAno"])),
    ideDocumento: pickClean(byKey, ["ideDocumento"]),
    urlDocumento: pickClean(byKey, ["urlDocumento"]),
    busca: normalize(txtFornecedor),
  } satisfies CotaFlat;
};

const mapProposicao = (byKey: HeaderIndex) => {
  const id = pickClean(byKey, ["id"]) || idFromUri(pickClean(byKey, ["uri"]));
  const ementa = pickClean(byKey, ["ementa"]);
  const ementaDetalhada = pickClean(byKey, ["ementaDetalhada"]);
  const keywords = pickClean(byKey, ["keywords"]);
  return {
    id,
    uri: pickClean(byKey, ["uri"]),
    siglaTipo: pickClean(byKey, ["siglaTipo"]),
    numero: intBr(pickFirst(byKey, ["numero"])),
    ano: intBr(pickFirst(byKey, ["ano"])),
    ementa,
    ementaDetalhada,
    keywords,
    dataApresentacao: dataBr(pickClean(byKey, ["dataApresentacao"])) ?? "",
    situacao: pickClean(byKey, ["ultimoStatus_descricaoSituacao"]),
    ultimoStatusData: pickClean(byKey, ["ultimoStatus_dataHora"]),
    ultimoStatusOrgao: pickClean(byKey, ["ultimoStatus_siglaOrgao"]),
    busca: normalize(`${ementa} ${ementaDetalhada} ${keywords}`),
  } satisfies ProposicaoFlat;
};

const mapProposicaoAutor = (byKey: HeaderIndex) => {
  const nomeAutor = pickClean(byKey, ["nomeAutor"]);
  return {
    idProposicao:
      pickClean(byKey, ["idProposicao"]) || idFromUri(pickClean(byKey, ["uriProposicao"])),
    idDeputadoAutor:
      pickClean(byKey, ["idDeputadoAutor"]) || idFromUri(pickClean(byKey, ["uriAutor"])),
    uriAutor: pickClean(byKey, ["uriAutor"]),
    nomeAutor,
    nomeAutorNorm: normalize(nomeAutor),
    proponente: intBr(pickFirst(byKey, ["proponente"])),
  } satisfies ProposicaoAutorFlat;
};

export const mapDeputados = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapDeputado(indexByKey(record))),
    Arr.filter((row) => row.id !== "")
  );

export const mapCotas = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapCota(indexByKey(record)))
  );

export const mapProposicoes = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapProposicao(indexByKey(record))),
    Arr.filter((row) => row.id !== "")
  );

export const mapProposicaoAutores = (records: readonly CsvRecord[]) =>
  pipe(
    records,
    Arr.map((record) => mapProposicaoAutor(indexByKey(record))),
    Arr.filter((row) => row.idProposicao !== "")
  );
