/**
 * Schema SQLite e helpers de insercao da fonte receita-cnpj.
 *
 * As funcoes recebem um Database (bun:sqlite) ja aberto -> testaveis com
 * Database(":memory:"). O indexer usa openDb() para o banco em disco.
 */

import type { Database } from "bun:sqlite";
import { batchInsert } from "../../core/store/sqlite-store";
import type {
  DominioRow,
  EmpresaRow,
  EstabelecimentoRow,
  SimplesRow,
  SocioRow,
} from "./mappers";
import type { DominioTabela } from "./catalog";

/**
 * Cria todas as tabelas, indices secundarios e tabelas FTS5.
 * Idempotente (IF NOT EXISTS).
 */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      cnpj_basico TEXT PRIMARY KEY,
      razao_social TEXT,
      razao_social_norm TEXT,
      natureza_juridica TEXT,
      qualificacao_responsavel TEXT,
      capital_social REAL,
      porte_empresa TEXT,
      ente_federativo_responsavel TEXT
    );

    CREATE TABLE IF NOT EXISTS estabelecimentos (
      cnpj_completo TEXT PRIMARY KEY,
      cnpj_basico TEXT,
      cnpj_ordem TEXT,
      cnpj_dv TEXT,
      identificador_matriz_filial TEXT,
      nome_fantasia TEXT,
      nome_fantasia_norm TEXT,
      situacao_cadastral TEXT,
      data_situacao_cadastral TEXT,
      motivo_situacao_cadastral TEXT,
      nome_cidade_exterior TEXT,
      pais TEXT,
      data_inicio_atividade TEXT,
      cnae_fiscal_principal TEXT,
      cnae_fiscal_secundaria TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cep TEXT,
      uf TEXT,
      municipio TEXT,
      ddd1 TEXT,
      telefone1 TEXT,
      correio_eletronico TEXT
    );

    CREATE TABLE IF NOT EXISTS socios (
      cnpj_basico TEXT,
      identificador_socio TEXT,
      nome_socio TEXT,
      nome_socio_norm TEXT,
      cnpj_cpf_socio TEXT,
      cpf_visivel TEXT,
      qualificacao_socio TEXT,
      data_entrada_sociedade TEXT,
      pais TEXT,
      representante_legal TEXT,
      nome_representante TEXT,
      qualificacao_representante_legal TEXT,
      faixa_etaria TEXT
    );

    CREATE TABLE IF NOT EXISTS simples (
      cnpj_basico TEXT PRIMARY KEY,
      opcao_simples TEXT,
      data_opcao_simples TEXT,
      data_exclusao_simples TEXT,
      opcao_mei TEXT,
      data_opcao_mei TEXT,
      data_exclusao_mei TEXT
    );

    CREATE TABLE IF NOT EXISTS dominios (
      tabela TEXT,
      codigo TEXT,
      descricao TEXT,
      PRIMARY KEY (tabela, codigo)
    );

    -- Indices secundarios para os filtros das tools.
    CREATE INDEX IF NOT EXISTS idx_estab_basico ON estabelecimentos (cnpj_basico);
    CREATE INDEX IF NOT EXISTS idx_estab_uf ON estabelecimentos (uf);
    CREATE INDEX IF NOT EXISTS idx_estab_municipio ON estabelecimentos (municipio);
    CREATE INDEX IF NOT EXISTS idx_estab_cnae ON estabelecimentos (cnae_fiscal_principal);
    CREATE INDEX IF NOT EXISTS idx_estab_situacao ON estabelecimentos (situacao_cadastral);
    CREATE INDEX IF NOT EXISTS idx_socios_basico ON socios (cnpj_basico);
    CREATE INDEX IF NOT EXISTS idx_socios_nome_norm ON socios (nome_socio_norm);
    CREATE INDEX IF NOT EXISTS idx_socios_cpf_visivel ON socios (cpf_visivel);
    CREATE INDEX IF NOT EXISTS idx_empresas_razao_norm ON empresas (razao_social_norm);

    -- FTS5 para busca por nome (razao social, nome fantasia e nome de socio).
    CREATE VIRTUAL TABLE IF NOT EXISTS empresas_fts USING fts5 (
      cnpj_basico UNINDEXED,
      razao_social
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS estabelecimentos_fts USING fts5 (
      cnpj_completo UNINDEXED,
      nome_fantasia
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS socios_fts USING fts5 (
      cnpj_basico UNINDEXED,
      nome_socio
    );
  `);
}

const EMPRESAS_SQL = `INSERT OR REPLACE INTO empresas
  (cnpj_basico, razao_social, razao_social_norm, natureza_juridica,
   qualificacao_responsavel, capital_social, porte_empresa,
   ente_federativo_responsavel)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const EMPRESAS_FTS_SQL = `INSERT INTO empresas_fts (cnpj_basico, razao_social) VALUES (?, ?)`;

export function insertEmpresas(db: Database, items: EmpresaRow[]): void {
  batchInsert(db, EMPRESAS_SQL, items, (e) => [
    e.cnpj_basico,
    e.razao_social,
    e.razao_social_norm,
    e.natureza_juridica,
    e.qualificacao_responsavel,
    e.capital_social,
    e.porte_empresa,
    e.ente_federativo_responsavel,
  ]);
  batchInsert(db, EMPRESAS_FTS_SQL, items, (e) => [e.cnpj_basico, e.razao_social]);
}

const ESTAB_SQL = `INSERT OR REPLACE INTO estabelecimentos
  (cnpj_completo, cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial,
   nome_fantasia, nome_fantasia_norm, situacao_cadastral, data_situacao_cadastral,
   motivo_situacao_cadastral, nome_cidade_exterior, pais, data_inicio_atividade,
   cnae_fiscal_principal, cnae_fiscal_secundaria, logradouro, numero, complemento,
   bairro, cep, uf, municipio, ddd1, telefone1, correio_eletronico)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const ESTAB_FTS_SQL = `INSERT INTO estabelecimentos_fts (cnpj_completo, nome_fantasia) VALUES (?, ?)`;

export function insertEstabelecimentos(
  db: Database,
  items: EstabelecimentoRow[]
): void {
  batchInsert(db, ESTAB_SQL, items, (e) => [
    e.cnpj_completo,
    e.cnpj_basico,
    e.cnpj_ordem,
    e.cnpj_dv,
    e.identificador_matriz_filial,
    e.nome_fantasia,
    e.nome_fantasia_norm,
    e.situacao_cadastral,
    e.data_situacao_cadastral,
    e.motivo_situacao_cadastral,
    e.nome_cidade_exterior,
    e.pais,
    e.data_inicio_atividade,
    e.cnae_fiscal_principal,
    e.cnae_fiscal_secundaria,
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    e.cep,
    e.uf,
    e.municipio,
    e.ddd1,
    e.telefone1,
    e.correio_eletronico,
  ]);
  batchInsert(db, ESTAB_FTS_SQL, items, (e) => [e.cnpj_completo, e.nome_fantasia]);
}

const SOCIOS_SQL = `INSERT INTO socios
  (cnpj_basico, identificador_socio, nome_socio, nome_socio_norm, cnpj_cpf_socio,
   cpf_visivel, qualificacao_socio, data_entrada_sociedade, pais,
   representante_legal, nome_representante, qualificacao_representante_legal,
   faixa_etaria)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const SOCIOS_FTS_SQL = `INSERT INTO socios_fts (cnpj_basico, nome_socio) VALUES (?, ?)`;

export function insertSocios(db: Database, items: SocioRow[]): void {
  batchInsert(db, SOCIOS_SQL, items, (s) => [
    s.cnpj_basico,
    s.identificador_socio,
    s.nome_socio,
    s.nome_socio_norm,
    s.cnpj_cpf_socio,
    s.cpf_visivel,
    s.qualificacao_socio,
    s.data_entrada_sociedade,
    s.pais,
    s.representante_legal,
    s.nome_representante,
    s.qualificacao_representante_legal,
    s.faixa_etaria,
  ]);
  batchInsert(db, SOCIOS_FTS_SQL, items, (s) => [s.cnpj_basico, s.nome_socio]);
}

const SIMPLES_SQL = `INSERT OR REPLACE INTO simples
  (cnpj_basico, opcao_simples, data_opcao_simples, data_exclusao_simples,
   opcao_mei, data_opcao_mei, data_exclusao_mei)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

export function insertSimples(db: Database, items: SimplesRow[]): void {
  batchInsert(db, SIMPLES_SQL, items, (s) => [
    s.cnpj_basico,
    s.opcao_simples,
    s.data_opcao_simples,
    s.data_exclusao_simples,
    s.opcao_mei,
    s.data_opcao_mei,
    s.data_exclusao_mei,
  ]);
}

const DOMINIO_SQL = `INSERT OR REPLACE INTO dominios (tabela, codigo, descricao) VALUES (?, ?, ?)`;

export function insertDominio(
  db: Database,
  tabela: DominioTabela,
  items: DominioRow[]
): void {
  batchInsert(db, DOMINIO_SQL, items, (d) => [tabela, d.codigo, d.descricao]);
}
