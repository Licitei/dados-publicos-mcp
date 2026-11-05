import { DateTime, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const RFB_BASE = "https://arquivos.receitafederal.gov.br";

export const RFB_WEBDAV = `${RFB_BASE}/public.php/webdav/`;

export const RFB_SHARE_TOKEN = "YggdBLfdninEJX9";

export const monthLookback = 6;

export const rfbAuthHeader = `Basic ${Buffer.from(`${RFB_SHARE_TOKEN}:`, "utf8").toString("base64")}`;

export const csvOptions = { encoding: "iso-8859-1", delimiter: ";" } as const;

export const missingStatus = new Set([401, 403, 404]);

const yyyymmImpl = (millis: number, monthsBack: number) => {
  const parts = DateTime.toPartsUtc(DateTime.makeUnsafe(millis));
  const total = parts.year * 12 + (parts.month - 1) - monthsBack;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return `${year}-${pipe(`${month}`, Str.padStart(2, "0"))}`;
};

export const yyyymm: {
  (monthsBack: number): (millis: number) => string;
  (millis: number, monthsBack: number): string;
} = dual(2, yyyymmImpl);

const webdavFileUrlImpl = (mes: string, file: string) =>
  `${RFB_WEBDAV}${mes}/${file}`;

export const webdavFileUrl: {
  (file: string): (mes: string) => string;
  (mes: string, file: string): string;
} = dual(2, webdavFileUrlImpl);

export const partFiles = (prefix: "Empresas" | "Estabelecimentos" | "Socios") =>
  pipe(
    Arr.range(0, 9),
    Arr.map((i) => `${prefix}${i}.zip`)
  );

export const defaultParts: readonly number[] = [0];

export const SIMPLES_FILE = "Simples.zip";

export const SENTINEL_FILE = "Cnaes.zip";

export const DOMINIO_FILES = [
  { tabela: "cnaes", file: "Cnaes.zip" },
  { tabela: "municipios", file: "Municipios.zip" },
  { tabela: "naturezas", file: "Naturezas.zip" },
  { tabela: "paises", file: "Paises.zip" },
  { tabela: "qualificacoes", file: "Qualificacoes.zip" },
  { tabela: "motivos", file: "Motivos.zip" },
] as const;

export type DominioTabela = (typeof DOMINIO_FILES)[number]["tabela"];

export const EMPRESAS_COLUNAS = [
  "cnpj_basico",
  "razao_social",
  "natureza_juridica",
  "qualificacao_responsavel",
  "capital_social",
  "porte_empresa",
  "ente_federativo_responsavel",
] as const;

export const ESTABELECIMENTOS_COLUNAS = [
  "cnpj_basico",
  "cnpj_ordem",
  "cnpj_dv",
  "identificador_matriz_filial",
  "nome_fantasia",
  "situacao_cadastral",
  "data_situacao_cadastral",
  "motivo_situacao_cadastral",
  "nome_cidade_exterior",
  "pais",
  "data_inicio_atividade",
  "cnae_fiscal_principal",
  "cnae_fiscal_secundaria",
  "tipo_logradouro",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "uf",
  "municipio",
  "ddd1",
  "telefone1",
  "ddd2",
  "telefone2",
  "ddd_fax",
  "fax",
  "correio_eletronico",
  "situacao_especial",
  "data_situacao_especial",
] as const;

export const SOCIOS_COLUNAS = [
  "cnpj_basico",
  "identificador_socio",
  "nome_socio",
  "cnpj_cpf_socio",
  "qualificacao_socio",
  "data_entrada_sociedade",
  "pais",
  "representante_legal",
  "nome_representante",
  "qualificacao_representante_legal",
  "faixa_etaria",
] as const;

export const SIMPLES_COLUNAS = [
  "cnpj_basico",
  "opcao_simples",
  "data_opcao_simples",
  "data_exclusao_simples",
  "opcao_mei",
  "data_opcao_mei",
  "data_exclusao_mei",
] as const;

export const DOMINIO_COLUNAS = ["codigo", "descricao"] as const;

export const SITUACAO_CADASTRAL: Record<string, string> = {
  "1": "nula",
  "01": "nula",
  "2": "ativa",
  "02": "ativa",
  "3": "suspensa",
  "03": "suspensa",
  "4": "inapta",
  "04": "inapta",
  "8": "baixada",
  "08": "baixada",
};

export const PORTE_EMPRESA: Record<string, string> = {
  "00": "nao informado",
  "01": "micro empresa",
  "03": "empresa de pequeno porte",
  "05": "demais",
};

export const MATRIZ_FILIAL: Record<string, string> = {
  "1": "matriz",
  "2": "filial",
};

export const IDENTIFICADOR_SOCIO: Record<string, string> = {
  "1": "pessoa juridica",
  "2": "pessoa fisica",
  "3": "estrangeiro",
};

const situacaoMap: Record<string, string> = {
  nula: "1",
  ativa: "2",
  suspensa: "3",
  inapta: "4",
  baixada: "8",
};

export const situacaoCodigo = (value: string) => {
  const digits = onlyDigits(value);
  return digits !== "" ? digits : (situacaoMap[normalize(value)] ?? null);
};

const porteMap: Record<string, string> = {
  me: "01",
  micro: "01",
  microempresa: "01",
  "micro empresa": "01",
  epp: "03",
  "empresa de pequeno porte": "03",
  "pequeno porte": "03",
  demais: "05",
};

export const porteCodigo = (value: string) => {
  const digits = onlyDigits(value);
  return digits !== ""
    ? pipe(digits, Str.padStart(2, "0"))
    : (porteMap[normalize(value)] ?? null);
};

const clean = (value: string) => pipe(value, Str.trim);

const pick = (record: Record<string, string>, keys: readonly string[]) =>
  pipe(
    keys,
    Arr.map((key) => pipe(record[key] ?? "", Str.trim)),
    Arr.findFirst((value) => value !== ""),
    Option.getOrElse(() => "")
  );

const field = (record: Record<string, string>, keys: readonly string[]) =>
  clean(pick(record, keys));

export const numeroBr = (value: string) => {
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

export const dataBr = (value: string) => {
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
            captures(text, /^(\d{4})-(\d{2})-(\d{2})$/),
            Option.map(([y, m, d]) => buildDate(y, m, d))
          )
        ),
        Option.getOrElse(() => null)
      )
    )
  );
};

const montarCnpjCompletoImpl = (basico: string, ordem: string, dv: string) =>
  pipe(onlyDigits(basico), Str.padStart(8, "0")) +
  pipe(onlyDigits(ordem), Str.padStart(4, "0")) +
  pipe(onlyDigits(dv), Str.padStart(2, "0"));

export const montarCnpjCompleto: {
  (ordem: string, dv: string): (basico: string) => string;
  (basico: string, ordem: string, dv: string): string;
} = dual(3, montarCnpjCompletoImpl);

export const cpfVisivel = (mascarado: string) => {
  const digits = onlyDigits(mascarado);
  return digits.length === 11
    ? pipe(digits, Str.slice(3, 9))
    : pipe(digits, Str.slice(0, 6));
};

export const EmpresaFlat = Schema.Struct({
  cnpjBasico: Schema.String,
  razaoSocial: Schema.String,
  razaoSocialNorm: Schema.String,
  naturezaJuridica: Schema.String,
  qualificacaoResponsavel: Schema.String,
  capitalSocial: Schema.NullOr(Schema.Finite),
  porte: Schema.String,
  busca: Schema.String,
});
export type EmpresaFlat = (typeof EmpresaFlat)["Type"];

export const EstabelecimentoFlat = Schema.Struct({
  cnpjCompleto: Schema.String,
  cnpjBasico: Schema.String,
  cnpjOrdem: Schema.String,
  cnpjDv: Schema.String,
  matrizFilial: Schema.String,
  nomeFantasia: Schema.String,
  situacaoCadastral: Schema.String,
  dataSituacao: Schema.NullOr(Schema.String),
  motivoSituacao: Schema.String,
  dataInicioAtividade: Schema.NullOr(Schema.String),
  cnaePrincipal: Schema.String,
  cnaeSecundario: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  bairro: Schema.String,
  logradouro: Schema.String,
  numero: Schema.String,
  complemento: Schema.String,
  cep: Schema.String,
  ddd: Schema.String,
  telefone: Schema.String,
  email: Schema.String,
  porte: Schema.NullOr(Schema.String),
});
export type EstabelecimentoFlat = (typeof EstabelecimentoFlat)["Type"];

export const SocioFlat = Schema.Struct({
  cnpjBasico: Schema.String,
  identificadorSocio: Schema.String,
  nomeSocio: Schema.String,
  nomeSocioNorm: Schema.String,
  cnpjCpfSocio: Schema.String,
  cpfVisivel: Schema.String,
  qualificacao: Schema.String,
  dataEntrada: Schema.NullOr(Schema.String),
  faixaEtaria: Schema.String,
  busca: Schema.String,
});
export type SocioFlat = (typeof SocioFlat)["Type"];

export const SimplesFlat = Schema.Struct({
  cnpjBasico: Schema.String,
  opcaoSimples: Schema.String,
  dataOpcaoSimples: Schema.NullOr(Schema.String),
  dataExclusaoSimples: Schema.NullOr(Schema.String),
  opcaoMei: Schema.String,
  dataOpcaoMei: Schema.NullOr(Schema.String),
  dataExclusaoMei: Schema.NullOr(Schema.String),
});
export type SimplesFlat = (typeof SimplesFlat)["Type"];

export const DominioFlat = Schema.Struct({
  tabela: Schema.String,
  codigo: Schema.String,
  descricao: Schema.String,
});
export type DominioFlat = (typeof DominioFlat)["Type"];

const mapEmpresa = (record: Record<string, string>) => {
  const razaoSocial = field(record, ["razao_social"]);
  return {
    cnpjBasico: onlyDigits(field(record, ["cnpj_basico"])),
    razaoSocial,
    razaoSocialNorm: normalize(razaoSocial),
    naturezaJuridica: field(record, ["natureza_juridica"]),
    qualificacaoResponsavel: field(record, ["qualificacao_responsavel"]),
    capitalSocial: numeroBr(pick(record, ["capital_social"])),
    porte: field(record, ["porte_empresa"]),
    busca: normalize(razaoSocial),
  } satisfies EmpresaFlat;
};

const mapEstabelecimento = (record: Record<string, string>) => {
  const basico = field(record, ["cnpj_basico"]);
  const ordem = field(record, ["cnpj_ordem"]);
  const dv = field(record, ["cnpj_dv"]);
  return {
    cnpjCompleto: montarCnpjCompleto(basico, ordem, dv),
    cnpjBasico: onlyDigits(basico),
    cnpjOrdem: onlyDigits(ordem),
    cnpjDv: onlyDigits(dv),
    matrizFilial: field(record, ["identificador_matriz_filial"]),
    nomeFantasia: field(record, ["nome_fantasia"]),
    situacaoCadastral: field(record, ["situacao_cadastral"]),
    dataSituacao: dataBr(field(record, ["data_situacao_cadastral"])),
    motivoSituacao: field(record, ["motivo_situacao_cadastral"]),
    dataInicioAtividade: dataBr(field(record, ["data_inicio_atividade"])),
    cnaePrincipal: field(record, ["cnae_fiscal_principal"]),
    cnaeSecundario: field(record, ["cnae_fiscal_secundaria"]),
    uf: pipe(field(record, ["uf"]), Str.toUpperCase),
    municipio: field(record, ["municipio"]),
    bairro: field(record, ["bairro"]),
    logradouro: field(record, ["logradouro"]),
    numero: field(record, ["numero"]),
    complemento: field(record, ["complemento"]),
    cep: field(record, ["cep"]),
    ddd: field(record, ["ddd1"]),
    telefone: field(record, ["telefone1"]),
    email: field(record, ["correio_eletronico"]),
    porte: null,
  } satisfies EstabelecimentoFlat;
};

const mapSocio = (record: Record<string, string>) => {
  const nome = field(record, ["nome_socio"]);
  const doc = field(record, ["cnpj_cpf_socio"]);
  return {
    cnpjBasico: onlyDigits(field(record, ["cnpj_basico"])),
    identificadorSocio: field(record, ["identificador_socio"]),
    nomeSocio: nome,
    nomeSocioNorm: normalize(nome),
    cnpjCpfSocio: onlyDigits(doc),
    cpfVisivel: cpfVisivel(doc),
    qualificacao: field(record, ["qualificacao_socio"]),
    dataEntrada: dataBr(field(record, ["data_entrada_sociedade"])),
    faixaEtaria: field(record, ["faixa_etaria"]),
    busca: normalize(nome),
  } satisfies SocioFlat;
};

const mapSimples = (record: Record<string, string>) => ({
  cnpjBasico: onlyDigits(field(record, ["cnpj_basico"])),
  opcaoSimples: field(record, ["opcao_simples"]),
  dataOpcaoSimples: dataBr(field(record, ["data_opcao_simples"])),
  dataExclusaoSimples: dataBr(field(record, ["data_exclusao_simples"])),
  opcaoMei: field(record, ["opcao_mei"]),
  dataOpcaoMei: dataBr(field(record, ["data_opcao_mei"])),
  dataExclusaoMei: dataBr(field(record, ["data_exclusao_mei"])),
}) satisfies SimplesFlat;

const mapDominio = (tabela: DominioTabela) => (record: Record<string, string>) =>
  ({
    tabela,
    codigo: field(record, ["codigo"]),
    descricao: field(record, ["descricao"]),
  }) satisfies DominioFlat;

type Records = readonly Record<string, string>[];

export const mapEmpresas = (records: Records) =>
  pipe(records, Arr.map(mapEmpresa));

export const mapEstabelecimentos = (records: Records) =>
  pipe(records, Arr.map(mapEstabelecimento));

export const mapSocios = (records: Records) => pipe(records, Arr.map(mapSocio));

export const mapSimplesRows = (records: Records) =>
  pipe(records, Arr.map(mapSimples));

const mapDominiosImpl = (records: Records, tabela: DominioTabela) =>
  pipe(records, Arr.map(mapDominio(tabela)));

export const mapDominios: {
  (tabela: DominioTabela): (records: Records) => ReturnType<typeof mapDominiosImpl>;
  (records: Records, tabela: DominioTabela): ReturnType<typeof mapDominiosImpl>;
} = dual(2, mapDominiosImpl);

export const ReceitaCnpjErrorCode = Schema.Literals([
  "receita.CNPJ_INVALIDO",
  "receita.SNAPSHOT_MISSING",
]);
export type ReceitaCnpjErrorCode = (typeof ReceitaCnpjErrorCode)["Type"];

export class ReceitaCnpjError extends Schema.TaggedError<ReceitaCnpjError, { readonly brand: unique symbol }>()(
  "ReceitaCnpjError",
  {
    code: ReceitaCnpjErrorCode,
  }
) {
  override get message() {
    switch (this.code) {
      case "receita.CNPJ_INVALIDO":
        return "CNPJ inválido: use 14 dígitos (básico+ordem+dv).";
      case "receita.SNAPSHOT_MISSING":
        return `Nenhuma pasta mensal da Receita Federal encontrada nos últimos ${monthLookback} meses.`;
    }
  }
}
