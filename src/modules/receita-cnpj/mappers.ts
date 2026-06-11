/**
 * Funcoes PURAS de parsing/mapeamento dos CSVs da RFB.
 *
 * Recebem bytes (Uint8Array/ArrayBuffer) ou string e devolvem registros
 * normalizados. Nenhuma rede, nenhum disco -> 100% testavel com fixtures.
 */

import { parseCsv } from "../../core/parse/csv";
import { parseDataBr } from "../../core/parse/data-br";
import { parseNumeroBr } from "../../core/parse/numero-br";
import { normalize, onlyDigits } from "../../core/normalize";
import {
  EMPRESAS_COLUNAS,
  ESTABELECIMENTOS_COLUNAS,
  RFB_DELIMITER,
  RFB_ENCODING,
  SIMPLES_COLUNAS,
  SOCIOS_COLUNAS,
} from "./catalog";

export type EmpresaRow = {
  cnpj_basico: string;
  razao_social: string;
  razao_social_norm: string;
  natureza_juridica: string;
  qualificacao_responsavel: string;
  capital_social: number | null;
  porte_empresa: string;
  ente_federativo_responsavel: string;
};

export type EstabelecimentoRow = {
  cnpj_basico: string;
  cnpj_ordem: string;
  cnpj_dv: string;
  cnpj_completo: string;
  identificador_matriz_filial: string;
  nome_fantasia: string;
  nome_fantasia_norm: string;
  situacao_cadastral: string;
  data_situacao_cadastral: string | null;
  motivo_situacao_cadastral: string;
  nome_cidade_exterior: string;
  pais: string;
  data_inicio_atividade: string | null;
  cnae_fiscal_principal: string;
  cnae_fiscal_secundaria: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  ddd1: string;
  telefone1: string;
  correio_eletronico: string;
};

export type SocioRow = {
  cnpj_basico: string;
  identificador_socio: string;
  nome_socio: string;
  nome_socio_norm: string;
  cnpj_cpf_socio: string;
  cpf_visivel: string;
  qualificacao_socio: string;
  data_entrada_sociedade: string | null;
  pais: string;
  representante_legal: string;
  nome_representante: string;
  qualificacao_representante_legal: string;
  faixa_etaria: string;
};

export type SimplesRow = {
  cnpj_basico: string;
  opcao_simples: string;
  data_opcao_simples: string | null;
  data_exclusao_simples: string | null;
  opcao_mei: string;
  data_opcao_mei: string | null;
  data_exclusao_mei: string | null;
};

export type DominioRow = {
  codigo: string;
  descricao: string;
};

const csvOpts = { delimiter: RFB_DELIMITER, hasHeader: false, encoding: RFB_ENCODING };

/** Decodifica os bytes do CSV (Latin-1) em matriz de linhas/celulas. */
function rows(bytes: Uint8Array | ArrayBuffer | string): string[][] {
  return parseCsv(bytes, csvOpts).filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

/** Monta o CNPJ completo de 14 digitos a partir de basico+ordem+dv. */
export function montarCnpjCompleto(
  basico: string,
  ordem: string,
  dv: string
): string {
  return (
    onlyDigits(basico).padStart(8, "0") +
    onlyDigits(ordem).padStart(4, "0") +
    onlyDigits(dv).padStart(2, "0")
  );
}

/**
 * Extrai os 6 digitos centrais visiveis de um CPF mascarado (***NNNNNN**).
 * Retorna "" quando nao reconhecer 6 digitos.
 */
export function cpfVisivel(mascarado: string): string {
  const digits = onlyDigits(mascarado ?? "");
  // CPF mascarado (***NNNNNN**) tem 6 digitos visiveis no meio.
  if (digits.length === 6) return digits;
  // CPF completo (11 digitos): os 6 centrais sao posicoes 4..9.
  if (digits.length === 11) return digits.slice(3, 9);
  // Qualquer outro caso: ate 6 primeiros digitos.
  return digits.slice(0, 6);
}

function cell(row: string[], idx: number): string {
  return (row[idx] ?? "").trim();
}

export function parseEmpresas(
  bytes: Uint8Array | ArrayBuffer | string
): EmpresaRow[] {
  const c = EMPRESAS_COLUNAS;
  return rows(bytes).map((r) => ({
    cnpj_basico: cell(r, c.indexOf("cnpj_basico")),
    razao_social: cell(r, c.indexOf("razao_social")),
    razao_social_norm: normalize(cell(r, c.indexOf("razao_social"))),
    natureza_juridica: cell(r, c.indexOf("natureza_juridica")),
    qualificacao_responsavel: cell(r, c.indexOf("qualificacao_responsavel")),
    capital_social: parseNumeroBr(cell(r, c.indexOf("capital_social"))),
    porte_empresa: cell(r, c.indexOf("porte_empresa")),
    ente_federativo_responsavel: cell(r, c.indexOf("ente_federativo_responsavel")),
  }));
}

export function parseEstabelecimentos(
  bytes: Uint8Array | ArrayBuffer | string
): EstabelecimentoRow[] {
  const c = ESTABELECIMENTOS_COLUNAS;
  return rows(bytes).map((r) => {
    const basico = cell(r, c.indexOf("cnpj_basico"));
    const ordem = cell(r, c.indexOf("cnpj_ordem"));
    const dv = cell(r, c.indexOf("cnpj_dv"));
    const nomeFantasia = cell(r, c.indexOf("nome_fantasia"));
    return {
      cnpj_basico: basico,
      cnpj_ordem: ordem,
      cnpj_dv: dv,
      cnpj_completo: montarCnpjCompleto(basico, ordem, dv),
      identificador_matriz_filial: cell(r, c.indexOf("identificador_matriz_filial")),
      nome_fantasia: nomeFantasia,
      nome_fantasia_norm: normalize(nomeFantasia),
      situacao_cadastral: cell(r, c.indexOf("situacao_cadastral")),
      data_situacao_cadastral: parseDataBr(cell(r, c.indexOf("data_situacao_cadastral"))),
      motivo_situacao_cadastral: cell(r, c.indexOf("motivo_situacao_cadastral")),
      nome_cidade_exterior: cell(r, c.indexOf("nome_cidade_exterior")),
      pais: cell(r, c.indexOf("pais")),
      data_inicio_atividade: parseDataBr(cell(r, c.indexOf("data_inicio_atividade"))),
      cnae_fiscal_principal: cell(r, c.indexOf("cnae_fiscal_principal")),
      cnae_fiscal_secundaria: cell(r, c.indexOf("cnae_fiscal_secundaria")),
      logradouro: cell(r, c.indexOf("logradouro")),
      numero: cell(r, c.indexOf("numero")),
      complemento: cell(r, c.indexOf("complemento")),
      bairro: cell(r, c.indexOf("bairro")),
      cep: cell(r, c.indexOf("cep")),
      uf: cell(r, c.indexOf("uf")).toUpperCase(),
      municipio: cell(r, c.indexOf("municipio")),
      ddd1: cell(r, c.indexOf("ddd1")),
      telefone1: cell(r, c.indexOf("telefone1")),
      correio_eletronico: cell(r, c.indexOf("correio_eletronico")),
    };
  });
}

export function parseSocios(
  bytes: Uint8Array | ArrayBuffer | string
): SocioRow[] {
  const c = SOCIOS_COLUNAS;
  return rows(bytes).map((r) => {
    const nome = cell(r, c.indexOf("nome_socio"));
    const cpfCnpj = cell(r, c.indexOf("cnpj_cpf_socio"));
    return {
      cnpj_basico: cell(r, c.indexOf("cnpj_basico")),
      identificador_socio: cell(r, c.indexOf("identificador_socio")),
      nome_socio: nome,
      nome_socio_norm: normalize(nome),
      cnpj_cpf_socio: cpfCnpj,
      cpf_visivel: cpfVisivel(cpfCnpj),
      qualificacao_socio: cell(r, c.indexOf("qualificacao_socio")),
      data_entrada_sociedade: parseDataBr(cell(r, c.indexOf("data_entrada_sociedade"))),
      pais: cell(r, c.indexOf("pais")),
      representante_legal: cell(r, c.indexOf("representante_legal")),
      nome_representante: cell(r, c.indexOf("nome_representante")),
      qualificacao_representante_legal: cell(r, c.indexOf("qualificacao_representante_legal")),
      faixa_etaria: cell(r, c.indexOf("faixa_etaria")),
    };
  });
}

export function parseSimples(
  bytes: Uint8Array | ArrayBuffer | string
): SimplesRow[] {
  const c = SIMPLES_COLUNAS;
  return rows(bytes).map((r) => ({
    cnpj_basico: cell(r, c.indexOf("cnpj_basico")),
    opcao_simples: cell(r, c.indexOf("opcao_simples")),
    data_opcao_simples: parseDataBr(cell(r, c.indexOf("data_opcao_simples"))),
    data_exclusao_simples: parseDataBr(cell(r, c.indexOf("data_exclusao_simples"))),
    opcao_mei: cell(r, c.indexOf("opcao_mei")),
    data_opcao_mei: parseDataBr(cell(r, c.indexOf("data_opcao_mei"))),
    data_exclusao_mei: parseDataBr(cell(r, c.indexOf("data_exclusao_mei"))),
  }));
}

/** Tabelas de dominio: 2 colunas (codigo;descricao). */
export function parseDominio(
  bytes: Uint8Array | ArrayBuffer | string
): DominioRow[] {
  return rows(bytes).map((r) => ({
    codigo: cell(r, 0),
    descricao: cell(r, 1),
  }));
}
