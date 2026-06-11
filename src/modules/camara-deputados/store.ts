/**
 * Camada de persistencia SQLite da Camara: aplica schema e insere as linhas
 * tipadas em lote, mantendo as tabelas FTS5 sincronizadas. Recebe a Database
 * por parametro (pode ser :memory: nos testes).
 */
import type { Database } from "bun:sqlite";
import { batchInsert } from "../../core/store/sqlite-store";
import { aplicarSchema } from "./schema";
import type {
  DeputadoRow,
  DespesaRow,
  ProposicaoAutorRow,
  ProposicaoRow,
} from "./mapping";

const DEPUTADO_SQL = `
INSERT OR REPLACE INTO deputados
  (id, uri, nome, nome_civil, nome_norm, sigla_sexo, data_nascimento,
   data_falecimento, uf_nascimento, municipio_nascimento,
   id_legislatura_inicial, id_legislatura_final)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const DESPESA_SQL = `
INSERT INTO despesas
  (nu_deputado_id, ide_cadastro, nome_parlamentar, cpf_deputado, sg_uf,
   sg_partido, num_sub_cota, txt_descricao, txt_fornecedor, cnpj_cpf,
   cnpj_cpf_norm, dat_emissao, vlr_documento, vlr_glosa, vlr_liquido,
   num_mes, num_ano, ide_documento, url_documento)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const PROPOSICAO_SQL = `
INSERT OR REPLACE INTO proposicoes
  (id, uri, sigla_tipo, numero, ano, ementa, ementa_detalhada, keywords,
   data_apresentacao, situacao, ultimo_status_data, ultimo_status_orgao)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const AUTOR_SQL = `
INSERT INTO proposicoes_autores
  (id_proposicao, id_deputado_autor, uri_autor, nome_autor, nome_autor_norm, proponente)
VALUES (?, ?, ?, ?, ?, ?)`;

/** Aplica o schema (idempotente). */
export function initDb(db: Database): void {
  aplicarSchema(db);
}

export function inserirDeputados(db: Database, rows: DeputadoRow[]): void {
  batchInsert(db, DEPUTADO_SQL, rows, (r) => [
    r.id,
    r.uri,
    r.nome,
    r.nomeCivil,
    r.nomeNorm,
    r.siglaSexo,
    r.dataNascimento,
    r.dataFalecimento,
    r.ufNascimento,
    r.municipioNascimento,
    r.idLegislaturaInicial,
    r.idLegislaturaFinal,
  ]);
}

export function inserirDespesas(db: Database, rows: DespesaRow[]): void {
  batchInsert(db, DESPESA_SQL, rows, (r) => [
    r.nuDeputadoId,
    r.ideCadastro,
    r.nomeParlamentar,
    r.cpfDeputado,
    r.sgUF,
    r.sgPartido,
    r.numSubCota,
    r.txtDescricao,
    r.txtFornecedor,
    r.cnpjCpf,
    r.cnpjCpfNorm,
    r.datEmissao,
    r.vlrDocumento,
    r.vlrGlosa,
    r.vlrLiquido,
    r.numMes,
    r.numAno,
    r.ideDocumento,
    r.urlDocumento,
  ]);
  // Reconstroi o indice FTS externo a partir do conteudo atual de despesas.
  // (O padrao "INSERT ... SELECT ... NOT IN (SELECT rowid FROM fts)" nao
  // funciona com content= externo, pois o subquery le da tabela de conteudo.)
  db.exec("INSERT INTO despesas_fts(despesas_fts) VALUES('rebuild')");
}

export function inserirProposicoes(db: Database, rows: ProposicaoRow[]): void {
  batchInsert(db, PROPOSICAO_SQL, rows, (r) => [
    r.id,
    r.uri,
    r.siglaTipo,
    r.numero,
    r.ano,
    r.ementa,
    r.ementaDetalhada,
    r.keywords,
    r.dataApresentacao,
    r.situacao,
    r.ultimoStatusData,
    r.ultimoStatusOrgao,
  ]);
  db.exec("INSERT INTO proposicoes_fts(proposicoes_fts) VALUES('rebuild')");
}

export function inserirProposicoesAutores(
  db: Database,
  rows: ProposicaoAutorRow[]
): void {
  batchInsert(db, AUTOR_SQL, rows, (r) => [
    r.idProposicao,
    r.idDeputadoAutor,
    r.uriAutor,
    r.nomeAutor,
    r.nomeAutorNorm,
    r.proponente,
  ]);
}

/** Grava um par chave/valor na tabela meta. */
export function setMeta(db: Database, chave: string, valor: string): void {
  db.prepare("INSERT OR REPLACE INTO meta(chave, valor) VALUES (?, ?)").run(
    chave,
    valor
  );
}

/** Le um valor da tabela meta (ou null). */
export function getMeta(db: Database, chave: string): string | null {
  const row = db
    .query("SELECT valor FROM meta WHERE chave = ?")
    .get(chave) as { valor: string } | null;

  return row?.valor ?? null;
}
