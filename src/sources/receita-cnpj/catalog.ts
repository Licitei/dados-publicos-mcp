import type { DuckTable } from "../../kernel/duck/duck";
import { DateTime, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Str from "effect/String";

const RFB_BASE = "https://arquivos.receitafederal.gov.br";

const RFB_WEBDAV = `${RFB_BASE}/public.php/webdav/`;

const RFB_SHARE_TOKEN = "YggdBLfdninEJX9";

export const monthLookback = 6;

export const rfbAuthHeader = `Basic ${Buffer.from(`${RFB_SHARE_TOKEN}:`, "utf8").toString("base64")}`;

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

const webdavFileUrlImpl = (mes: string, file: string) => `${RFB_WEBDAV}${mes}/${file}`;

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

const ReceitaCnpjErrorCode = Schema.Literals([
  "receita.CNPJ_INVALIDO",
  "receita.SNAPSHOT_MISSING",
  "receita.STAGING",
]);

export class ReceitaCnpjError extends Schema.TaggedError<
  ReceitaCnpjError,
  { readonly brand: unique symbol }
>()("ReceitaCnpjError", {
  code: ReceitaCnpjErrorCode,
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "receita.CNPJ_INVALIDO":
        return "CNPJ inválido: use 14 dígitos (básico+ordem+dv).";
      case "receita.SNAPSHOT_MISSING":
        return `Nenhuma pasta mensal da Receita Federal encontrada nos últimos ${monthLookback} meses.`;
      case "receita.STAGING":
        return "Falha ao preparar os arquivos temporários da Receita Federal.";
    }
  }
}

export const receitaTables: readonly DuckTable[] = [
  {
    name: "dominio",
    key: "codigo",
    columns: {
      tabela: "VARCHAR",
      codigo: "VARCHAR",
      descricao: "VARCHAR",
    },
  },
  {
    name: "empresa",
    key: "cnpj_basico",
    columns: {
      cnpj_basico: "VARCHAR",
      razao_social: "VARCHAR",
      natureza_juridica: "VARCHAR",
      qualificacao_responsavel: "VARCHAR",
      capital_social: "DOUBLE",
      porte: "VARCHAR",
      busca: "VARCHAR",
    },
  },
  {
    name: "estabelecimento",
    key: "cnpj_completo",
    columns: {
      cnpj_completo: "VARCHAR",
      cnpj_basico: "VARCHAR",
      cnpj_ordem: "VARCHAR",
      cnpj_dv: "VARCHAR",
      matriz_filial: "VARCHAR",
      nome_fantasia: "VARCHAR",
      situacao_cadastral: "VARCHAR",
      data_situacao: "VARCHAR",
      motivo_situacao: "VARCHAR",
      data_inicio_atividade: "VARCHAR",
      cnae_principal: "VARCHAR",
      cnae_secundario: "VARCHAR",
      uf: "VARCHAR",
      municipio: "VARCHAR",
      bairro: "VARCHAR",
      logradouro: "VARCHAR",
      numero: "VARCHAR",
      complemento: "VARCHAR",
      cep: "VARCHAR",
      ddd: "VARCHAR",
      telefone: "VARCHAR",
      email: "VARCHAR",
    },
  },
  {
    name: "socio",
    key: "cnpj_basico",
    columns: {
      cnpj_basico: "VARCHAR",
      identificador_socio: "VARCHAR",
      nome_socio: "VARCHAR",
      cnpj_cpf_socio: "VARCHAR",
      cpf_visivel: "VARCHAR",
      qualificacao: "VARCHAR",
      data_entrada: "VARCHAR",
      faixa_etaria: "VARCHAR",
      busca: "VARCHAR",
    },
  },
  {
    name: "simples",
    key: "cnpj_basico",
    columns: {
      cnpj_basico: "VARCHAR",
      opcao_simples: "VARCHAR",
      data_opcao_simples: "VARCHAR",
      data_exclusao_simples: "VARCHAR",
      opcao_mei: "VARCHAR",
      data_opcao_mei: "VARCHAR",
      data_exclusao_mei: "VARCHAR",
    },
  },
];
