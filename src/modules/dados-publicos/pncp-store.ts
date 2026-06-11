/**
 * Schema SQLite + helpers de insercao do indice offline do PNCP.
 *
 * Tabelas: contratacao, contrato, ata + indices secundarios (niFornecedor,
 * orgaoCnpj, codigoIbge, datas) + FTS5 (objetoCompra/objetoContrato/
 * objetoContratacao e nomeRazaoSocialFornecedor) mantido em sincronia por
 * triggers. Toda a logica recebe um Database (bun:sqlite), portanto funciona
 * com Database(":memory:") nos testes - sem rede, sem disco.
 */

import type { Database } from "bun:sqlite";
import { batchInsert } from "../../core/store/sqlite-store";
import { FTS_TABELAS, META_TABELA, TABELAS } from "./pncp-catalog";
import type { AtaRow, ContratacaoRow, ContratoRow } from "./pncp-mapper";

/**
 * Cria (IF NOT EXISTS) tabelas, indices e tabelas FTS5 com triggers de sync.
 * Idempotente.
 */
export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${TABELAS.contratacao}" (
      numeroControlePNCP TEXT PRIMARY KEY,
      anoCompra INTEGER,
      sequencialCompra INTEGER,
      objetoCompra TEXT NOT NULL DEFAULT '',
      modalidadeId INTEGER,
      modalidadeNome TEXT,
      situacaoCompraNome TEXT,
      valorTotalEstimado REAL,
      valorTotalHomologado REAL,
      dataPublicacaoPncp TEXT,
      dataAberturaProposta TEXT,
      dataEncerramentoProposta TEXT,
      dataAtualizacaoGlobal TEXT,
      orgaoCnpj TEXT,
      orgaoRazaoSocial TEXT,
      esferaId TEXT,
      poderId TEXT,
      codigoIbge TEXT,
      municipioNome TEXT,
      ufSigla TEXT,
      srp INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_contratacao_orgao ON "${TABELAS.contratacao}" (orgaoCnpj);
    CREATE INDEX IF NOT EXISTS idx_contratacao_ibge ON "${TABELAS.contratacao}" (codigoIbge);
    CREATE INDEX IF NOT EXISTS idx_contratacao_uf ON "${TABELAS.contratacao}" (ufSigla);
    CREATE INDEX IF NOT EXISTS idx_contratacao_modalidade ON "${TABELAS.contratacao}" (modalidadeId);
    CREATE INDEX IF NOT EXISTS idx_contratacao_atualizacao ON "${TABELAS.contratacao}" (dataAtualizacaoGlobal);
    CREATE INDEX IF NOT EXISTS idx_contratacao_publicacao ON "${TABELAS.contratacao}" (dataPublicacaoPncp);

    CREATE TABLE IF NOT EXISTS "${TABELAS.contrato}" (
      numeroControlePNCP TEXT PRIMARY KEY,
      numeroControlePncpCompra TEXT,
      anoContrato INTEGER,
      sequencialContrato INTEGER,
      objetoContrato TEXT NOT NULL DEFAULT '',
      niFornecedor TEXT,
      tipoPessoa TEXT,
      nomeRazaoSocialFornecedor TEXT NOT NULL DEFAULT '',
      niFornecedorSubContratado TEXT,
      nomeFornecedorSubContratado TEXT,
      valorInicial REAL,
      valorGlobal REAL,
      valorAcumulado REAL,
      dataAssinatura TEXT,
      dataVigenciaInicio TEXT,
      dataVigenciaFim TEXT,
      dataPublicacaoPncp TEXT,
      dataAtualizacaoGlobal TEXT,
      orgaoCnpj TEXT,
      orgaoRazaoSocial TEXT,
      codigoIbge TEXT,
      ufSigla TEXT,
      tipoContrato TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contrato_fornecedor ON "${TABELAS.contrato}" (niFornecedor);
    CREATE INDEX IF NOT EXISTS idx_contrato_orgao ON "${TABELAS.contrato}" (orgaoCnpj);
    CREATE INDEX IF NOT EXISTS idx_contrato_ibge ON "${TABELAS.contrato}" (codigoIbge);
    CREATE INDEX IF NOT EXISTS idx_contrato_uf ON "${TABELAS.contrato}" (ufSigla);
    CREATE INDEX IF NOT EXISTS idx_contrato_compra ON "${TABELAS.contrato}" (numeroControlePncpCompra);
    CREATE INDEX IF NOT EXISTS idx_contrato_atualizacao ON "${TABELAS.contrato}" (dataAtualizacaoGlobal);

    CREATE TABLE IF NOT EXISTS "${TABELAS.ata}" (
      numeroControlePNCPAta TEXT PRIMARY KEY,
      numeroControlePNCPCompra TEXT,
      anoAta INTEGER,
      numeroAtaRegistroPreco TEXT,
      objetoContratacao TEXT NOT NULL DEFAULT '',
      vigenciaInicio TEXT,
      vigenciaFim TEXT,
      dataAtualizacaoGlobal TEXT,
      cnpjOrgao TEXT,
      nomeOrgao TEXT,
      codigoUnidadeOrgao TEXT,
      ufSigla TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ata_orgao ON "${TABELAS.ata}" (cnpjOrgao);
    CREATE INDEX IF NOT EXISTS idx_ata_uf ON "${TABELAS.ata}" (ufSigla);
    CREATE INDEX IF NOT EXISTS idx_ata_compra ON "${TABELAS.ata}" (numeroControlePNCPCompra);
    CREATE INDEX IF NOT EXISTS idx_ata_atualizacao ON "${TABELAS.ata}" (dataAtualizacaoGlobal);

    CREATE TABLE IF NOT EXISTS "${META_TABELA}" (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  createFts(db);
}

function createFts(db: Database): void {
  // FTS5 sobre objetoCompra das contratacoes (busca full-text de editais).
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS "${FTS_TABELAS.contratacao}"
      USING fts5(
        numeroControlePNCP UNINDEXED,
        objetoCompra,
        content='${TABELAS.contratacao}',
        content_rowid='rowid'
      );

    CREATE TRIGGER IF NOT EXISTS contratacao_ai AFTER INSERT ON "${TABELAS.contratacao}" BEGIN
      INSERT INTO "${FTS_TABELAS.contratacao}"(rowid, numeroControlePNCP, objetoCompra)
        VALUES (new.rowid, new.numeroControlePNCP, new.objetoCompra);
    END;
    CREATE TRIGGER IF NOT EXISTS contratacao_ad AFTER DELETE ON "${TABELAS.contratacao}" BEGIN
      INSERT INTO "${FTS_TABELAS.contratacao}"("${FTS_TABELAS.contratacao}", rowid, numeroControlePNCP, objetoCompra)
        VALUES ('delete', old.rowid, old.numeroControlePNCP, old.objetoCompra);
    END;
    CREATE TRIGGER IF NOT EXISTS contratacao_au AFTER UPDATE ON "${TABELAS.contratacao}" BEGIN
      INSERT INTO "${FTS_TABELAS.contratacao}"("${FTS_TABELAS.contratacao}", rowid, numeroControlePNCP, objetoCompra)
        VALUES ('delete', old.rowid, old.numeroControlePNCP, old.objetoCompra);
      INSERT INTO "${FTS_TABELAS.contratacao}"(rowid, numeroControlePNCP, objetoCompra)
        VALUES (new.rowid, new.numeroControlePNCP, new.objetoCompra);
    END;
  `);

  // FTS5 sobre objetoContrato + nomeRazaoSocialFornecedor (busca por nome).
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS "${FTS_TABELAS.contrato}"
      USING fts5(
        numeroControlePNCP UNINDEXED,
        objetoContrato,
        nomeRazaoSocialFornecedor,
        content='${TABELAS.contrato}',
        content_rowid='rowid'
      );

    CREATE TRIGGER IF NOT EXISTS contrato_ai AFTER INSERT ON "${TABELAS.contrato}" BEGIN
      INSERT INTO "${FTS_TABELAS.contrato}"(rowid, numeroControlePNCP, objetoContrato, nomeRazaoSocialFornecedor)
        VALUES (new.rowid, new.numeroControlePNCP, new.objetoContrato, new.nomeRazaoSocialFornecedor);
    END;
    CREATE TRIGGER IF NOT EXISTS contrato_ad AFTER DELETE ON "${TABELAS.contrato}" BEGIN
      INSERT INTO "${FTS_TABELAS.contrato}"("${FTS_TABELAS.contrato}", rowid, numeroControlePNCP, objetoContrato, nomeRazaoSocialFornecedor)
        VALUES ('delete', old.rowid, old.numeroControlePNCP, old.objetoContrato, old.nomeRazaoSocialFornecedor);
    END;
    CREATE TRIGGER IF NOT EXISTS contrato_au AFTER UPDATE ON "${TABELAS.contrato}" BEGIN
      INSERT INTO "${FTS_TABELAS.contrato}"("${FTS_TABELAS.contrato}", rowid, numeroControlePNCP, objetoContrato, nomeRazaoSocialFornecedor)
        VALUES ('delete', old.rowid, old.numeroControlePNCP, old.objetoContrato, old.nomeRazaoSocialFornecedor);
      INSERT INTO "${FTS_TABELAS.contrato}"(rowid, numeroControlePNCP, objetoContrato, nomeRazaoSocialFornecedor)
        VALUES (new.rowid, new.numeroControlePNCP, new.objetoContrato, new.nomeRazaoSocialFornecedor);
    END;
  `);

  // FTS5 sobre objetoContratacao das atas.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS "${FTS_TABELAS.ata}"
      USING fts5(
        numeroControlePNCPAta UNINDEXED,
        objetoContratacao,
        content='${TABELAS.ata}',
        content_rowid='rowid'
      );

    CREATE TRIGGER IF NOT EXISTS ata_ai AFTER INSERT ON "${TABELAS.ata}" BEGIN
      INSERT INTO "${FTS_TABELAS.ata}"(rowid, numeroControlePNCPAta, objetoContratacao)
        VALUES (new.rowid, new.numeroControlePNCPAta, new.objetoContratacao);
    END;
    CREATE TRIGGER IF NOT EXISTS ata_ad AFTER DELETE ON "${TABELAS.ata}" BEGIN
      INSERT INTO "${FTS_TABELAS.ata}"("${FTS_TABELAS.ata}", rowid, numeroControlePNCPAta, objetoContratacao)
        VALUES ('delete', old.rowid, old.numeroControlePNCPAta, old.objetoContratacao);
    END;
    CREATE TRIGGER IF NOT EXISTS ata_au AFTER UPDATE ON "${TABELAS.ata}" BEGIN
      INSERT INTO "${FTS_TABELAS.ata}"("${FTS_TABELAS.ata}", rowid, numeroControlePNCPAta, objetoContratacao)
        VALUES ('delete', old.rowid, old.numeroControlePNCPAta, old.objetoContratacao);
      INSERT INTO "${FTS_TABELAS.ata}"(rowid, numeroControlePNCPAta, objetoContratacao)
        VALUES (new.rowid, new.numeroControlePNCPAta, new.objetoContratacao);
    END;
  `);
}

const contratacaoInsertSql = `
  INSERT INTO "${TABELAS.contratacao}" (
    numeroControlePNCP, anoCompra, sequencialCompra, objetoCompra, modalidadeId,
    modalidadeNome, situacaoCompraNome, valorTotalEstimado, valorTotalHomologado,
    dataPublicacaoPncp, dataAberturaProposta, dataEncerramentoProposta,
    dataAtualizacaoGlobal, orgaoCnpj, orgaoRazaoSocial, esferaId, poderId,
    codigoIbge, municipioNome, ufSigla, srp
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(numeroControlePNCP) DO UPDATE SET
    anoCompra=excluded.anoCompra,
    sequencialCompra=excluded.sequencialCompra,
    objetoCompra=excluded.objetoCompra,
    modalidadeId=excluded.modalidadeId,
    modalidadeNome=excluded.modalidadeNome,
    situacaoCompraNome=excluded.situacaoCompraNome,
    valorTotalEstimado=excluded.valorTotalEstimado,
    valorTotalHomologado=excluded.valorTotalHomologado,
    dataPublicacaoPncp=excluded.dataPublicacaoPncp,
    dataAberturaProposta=excluded.dataAberturaProposta,
    dataEncerramentoProposta=excluded.dataEncerramentoProposta,
    dataAtualizacaoGlobal=excluded.dataAtualizacaoGlobal,
    orgaoCnpj=excluded.orgaoCnpj,
    orgaoRazaoSocial=excluded.orgaoRazaoSocial,
    esferaId=excluded.esferaId,
    poderId=excluded.poderId,
    codigoIbge=excluded.codigoIbge,
    municipioNome=excluded.municipioNome,
    ufSigla=excluded.ufSigla,
    srp=excluded.srp
`;

const contratoInsertSql = `
  INSERT INTO "${TABELAS.contrato}" (
    numeroControlePNCP, numeroControlePncpCompra, anoContrato, sequencialContrato,
    objetoContrato, niFornecedor, tipoPessoa, nomeRazaoSocialFornecedor,
    niFornecedorSubContratado, nomeFornecedorSubContratado, valorInicial,
    valorGlobal, valorAcumulado, dataAssinatura, dataVigenciaInicio,
    dataVigenciaFim, dataPublicacaoPncp, dataAtualizacaoGlobal, orgaoCnpj,
    orgaoRazaoSocial, codigoIbge, ufSigla, tipoContrato
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(numeroControlePNCP) DO UPDATE SET
    numeroControlePncpCompra=excluded.numeroControlePncpCompra,
    anoContrato=excluded.anoContrato,
    sequencialContrato=excluded.sequencialContrato,
    objetoContrato=excluded.objetoContrato,
    niFornecedor=excluded.niFornecedor,
    tipoPessoa=excluded.tipoPessoa,
    nomeRazaoSocialFornecedor=excluded.nomeRazaoSocialFornecedor,
    niFornecedorSubContratado=excluded.niFornecedorSubContratado,
    nomeFornecedorSubContratado=excluded.nomeFornecedorSubContratado,
    valorInicial=excluded.valorInicial,
    valorGlobal=excluded.valorGlobal,
    valorAcumulado=excluded.valorAcumulado,
    dataAssinatura=excluded.dataAssinatura,
    dataVigenciaInicio=excluded.dataVigenciaInicio,
    dataVigenciaFim=excluded.dataVigenciaFim,
    dataPublicacaoPncp=excluded.dataPublicacaoPncp,
    dataAtualizacaoGlobal=excluded.dataAtualizacaoGlobal,
    orgaoCnpj=excluded.orgaoCnpj,
    orgaoRazaoSocial=excluded.orgaoRazaoSocial,
    codigoIbge=excluded.codigoIbge,
    ufSigla=excluded.ufSigla,
    tipoContrato=excluded.tipoContrato
`;

const ataInsertSql = `
  INSERT INTO "${TABELAS.ata}" (
    numeroControlePNCPAta, numeroControlePNCPCompra, anoAta, numeroAtaRegistroPreco,
    objetoContratacao, vigenciaInicio, vigenciaFim, dataAtualizacaoGlobal,
    cnpjOrgao, nomeOrgao, codigoUnidadeOrgao, ufSigla
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(numeroControlePNCPAta) DO UPDATE SET
    numeroControlePNCPCompra=excluded.numeroControlePNCPCompra,
    anoAta=excluded.anoAta,
    numeroAtaRegistroPreco=excluded.numeroAtaRegistroPreco,
    objetoContratacao=excluded.objetoContratacao,
    vigenciaInicio=excluded.vigenciaInicio,
    vigenciaFim=excluded.vigenciaFim,
    dataAtualizacaoGlobal=excluded.dataAtualizacaoGlobal,
    cnpjOrgao=excluded.cnpjOrgao,
    nomeOrgao=excluded.nomeOrgao,
    codigoUnidadeOrgao=excluded.codigoUnidadeOrgao,
    ufSigla=excluded.ufSigla
`;

export function insertContratacoes(db: Database, rows: ContratacaoRow[]): void {
  batchInsert(db, contratacaoInsertSql, rows, (r) => [
    r.numeroControlePNCP,
    r.anoCompra,
    r.sequencialCompra,
    r.objetoCompra,
    r.modalidadeId,
    r.modalidadeNome,
    r.situacaoCompraNome,
    r.valorTotalEstimado,
    r.valorTotalHomologado,
    r.dataPublicacaoPncp,
    r.dataAberturaProposta,
    r.dataEncerramentoProposta,
    r.dataAtualizacaoGlobal,
    r.orgaoCnpj,
    r.orgaoRazaoSocial,
    r.esferaId,
    r.poderId,
    r.codigoIbge,
    r.municipioNome,
    r.ufSigla,
    r.srp,
  ]);
}

export function insertContratos(db: Database, rows: ContratoRow[]): void {
  batchInsert(db, contratoInsertSql, rows, (r) => [
    r.numeroControlePNCP,
    r.numeroControlePncpCompra,
    r.anoContrato,
    r.sequencialContrato,
    r.objetoContrato,
    r.niFornecedor,
    r.tipoPessoa,
    r.nomeRazaoSocialFornecedor,
    r.niFornecedorSubContratado,
    r.nomeFornecedorSubContratado,
    r.valorInicial,
    r.valorGlobal,
    r.valorAcumulado,
    r.dataAssinatura,
    r.dataVigenciaInicio,
    r.dataVigenciaFim,
    r.dataPublicacaoPncp,
    r.dataAtualizacaoGlobal,
    r.orgaoCnpj,
    r.orgaoRazaoSocial,
    r.codigoIbge,
    r.ufSigla,
    r.tipoContrato,
  ]);
}

export function insertAtas(db: Database, rows: AtaRow[]): void {
  batchInsert(db, ataInsertSql, rows, (r) => [
    r.numeroControlePNCPAta,
    r.numeroControlePNCPCompra,
    r.anoAta,
    r.numeroAtaRegistroPreco,
    r.objetoContratacao,
    r.vigenciaInicio,
    r.vigenciaFim,
    r.dataAtualizacaoGlobal,
    r.cnpjOrgao,
    r.nomeOrgao,
    r.codigoUnidadeOrgao,
    r.ufSigla,
  ]);
}

/** Grava um par chave/valor na tabela de metadados. */
export function setMeta(db: Database, chave: string, valor: string): void {
  db.prepare(
    `INSERT INTO "${META_TABELA}" (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`,
  ).run(chave, valor);
}

/** Le um valor da tabela de metadados (null se ausente). */
export function getMeta(db: Database, chave: string): string | null {
  const row = db
    .query(`SELECT valor FROM "${META_TABELA}" WHERE chave = ?`)
    .get(chave) as { valor: string } | null;
  return row?.valor ?? null;
}
