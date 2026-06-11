import type { Database } from "bun:sqlite";

/**
 * DDL do banco da Camara dos Deputados.
 *
 * Tabelas:
 *  - deputados: lista historica (id extraido da uri; cpf vem 100% vazio nos
 *    arquivos publicos, identidade confiavel so por id).
 *  - despesas: linhas de CEAP/cota parlamentar. txtcnpjcpf normalizado para
 *    so digitos (chave de cruzamento com licitacoes/sancoes).
 *  - proposicoes: proposicoes por ano (ementa/keywords).
 *  - proposicoes_autores: liga proposicao -> deputado autor.
 *
 * Indices secundarios cobrem os filtros das tools (cnpj/cpf, deputado, ano).
 * FTS5 (contentless, content=) cobre busca por nome de fornecedor e por
 * ementa/keywords de proposicoes.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deputados (
  id INTEGER PRIMARY KEY,
  uri TEXT,
  nome TEXT,
  nome_civil TEXT,
  nome_norm TEXT,
  sigla_sexo TEXT,
  data_nascimento TEXT,
  data_falecimento TEXT,
  uf_nascimento TEXT,
  municipio_nascimento TEXT,
  id_legislatura_inicial INTEGER,
  id_legislatura_final INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deputados_nome_norm ON deputados(nome_norm);

CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nu_deputado_id INTEGER,
  ide_cadastro INTEGER,
  nome_parlamentar TEXT,
  cpf_deputado TEXT,
  sg_uf TEXT,
  sg_partido TEXT,
  num_sub_cota INTEGER,
  txt_descricao TEXT,
  txt_fornecedor TEXT,
  cnpj_cpf TEXT,
  cnpj_cpf_norm TEXT,
  dat_emissao TEXT,
  vlr_documento REAL,
  vlr_glosa REAL,
  vlr_liquido REAL,
  num_mes INTEGER,
  num_ano INTEGER,
  ide_documento TEXT,
  url_documento TEXT
);
CREATE INDEX IF NOT EXISTS idx_despesas_cnpj_norm ON despesas(cnpj_cpf_norm);
CREATE INDEX IF NOT EXISTS idx_despesas_deputado ON despesas(nu_deputado_id);
CREATE INDEX IF NOT EXISTS idx_despesas_ano ON despesas(num_ano);

CREATE VIRTUAL TABLE IF NOT EXISTS despesas_fts USING fts5(
  txt_fornecedor,
  content='despesas',
  content_rowid='id'
);

CREATE TABLE IF NOT EXISTS proposicoes (
  id INTEGER PRIMARY KEY,
  uri TEXT,
  sigla_tipo TEXT,
  numero INTEGER,
  ano INTEGER,
  ementa TEXT,
  ementa_detalhada TEXT,
  keywords TEXT,
  data_apresentacao TEXT,
  situacao TEXT,
  ultimo_status_data TEXT,
  ultimo_status_orgao TEXT
);
CREATE INDEX IF NOT EXISTS idx_proposicoes_ano ON proposicoes(ano);
CREATE INDEX IF NOT EXISTS idx_proposicoes_tipo ON proposicoes(sigla_tipo);

CREATE VIRTUAL TABLE IF NOT EXISTS proposicoes_fts USING fts5(
  ementa,
  ementa_detalhada,
  keywords,
  content='proposicoes',
  content_rowid='id'
);

CREATE TABLE IF NOT EXISTS proposicoes_autores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_proposicao INTEGER,
  id_deputado_autor INTEGER,
  uri_autor TEXT,
  nome_autor TEXT,
  nome_autor_norm TEXT,
  proponente INTEGER
);
CREATE INDEX IF NOT EXISTS idx_autores_proposicao ON proposicoes_autores(id_proposicao);
CREATE INDEX IF NOT EXISTS idx_autores_deputado ON proposicoes_autores(id_deputado_autor);

CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`;

/** Cria todas as tabelas/indices/FTS se ainda nao existirem. */
export function aplicarSchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}
