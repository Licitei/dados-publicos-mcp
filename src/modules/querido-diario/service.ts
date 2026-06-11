import type { Database } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { existsSync } from "node:fs";
import { dominioPath } from "../../core/dataDir";
import { onlyDigits } from "../../core/normalize";
import { conteudoParaFts } from "./parse";
import { key as DOMINIO } from "./catalog";
import { queridoDiarioErrors } from "./errors";
import { DB_FILE } from "./store";

/** Canal de erro do servico: EvlogError do catalogo `querido-diario`. */
export type QdServiceError = EvlogError;

export function dbPath(): string {
  return dominioPath(DOMINIO, DB_FILE);
}

export function dbExistsOnDisk(): boolean {
  return existsSync(dbPath());
}

export type DiarioHit = {
  territoryId: string;
  uf: string;
  municipio: string;
  ano: number | null;
  data: string | null;
  poder: string | null;
  edicao: string | null;
  edicaoExtra: boolean;
  urlOriginal: string | null;
  trecho: string;
};

type DiarioRow = {
  id: number;
  territory_id: string;
  uf: string;
  municipio: string;
  ano: number | null;
  data: string | null;
  poder: string | null;
  edicao: string | null;
  edicao_extra: number;
  url_original: string | null;
  conteudo: string;
};

/**
 * Escapa um termo livre para FTS5: cada token vira uma string entre aspas
 * (frase exata), prefixado em AND implicito. Aspas internas sao duplicadas.
 * Aplica a mesma normalizacao do indice (lowercase, sem acento) para casar
 * com o conteudo OCR indexado.
 */
export function toFtsMatch(termo: string): string {
  const normalizado = conteudoParaFts(termo);
  const tokens = normalizado.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return '""';

  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

function mapRow(row: DiarioRow, termoBruto?: string): DiarioHit {
  return {
    territoryId: row.territory_id,
    uf: row.uf,
    municipio: row.municipio,
    ano: row.ano,
    data: row.data,
    poder: row.poder,
    edicao: row.edicao,
    edicaoExtra: row.edicao_extra === 1,
    urlOriginal: row.url_original,
    trecho: snippet(row.conteudo, termoBruto),
  };
}

/** Recorta um trecho do conteudo em torno da primeira ocorrencia do termo. */
export function snippet(conteudo: string, termo?: string, raio = 160): string {
  if (!conteudo) return "";

  if (termo) {
    const alvo = conteudoParaFts(termo).split(/\s+/).filter(Boolean)[0];

    if (alvo) {
      const pos = conteudoParaFts(conteudo).indexOf(alvo);

      if (pos >= 0) {
        const start = Math.max(0, pos - raio);
        const end = Math.min(conteudo.length, pos + alvo.length + raio);

        return (
          (start > 0 ? "..." : "") +
          conteudo.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < conteudo.length ? "..." : "")
        );
      }
    }
  }

  return conteudo.slice(0, raio * 2).replace(/\s+/g, " ").trim();
}

export type BuscarDiariosInput = {
  termo: string;
  uf?: string;
  territoryId?: string;
  dataInicial?: string;
  dataFinal?: string;
  limite?: number;
};

/**
 * Busca full-text no conteudo extraido (<conteudo>) via FTS5.
 * Cobre o "buraco municipal" do PNCP: busca por nome de empresa/fornecedor,
 * objeto de licitacao, modalidade, numero de edital direto no corpo do diario.
 */
export function buscarDiarios(
  db: Database,
  input: BuscarDiariosInput
): ResultType<DiarioHit[], QdServiceError> {
  return Result.try({
    try: () => {
      const limite = clampLimit(input.limite);
      const where: string[] = ["diarios_fts MATCH ?"];
      const params: unknown[] = [toFtsMatch(input.termo)];

      if (input.uf) {
        where.push("d.uf = ?");
        params.push(input.uf.toUpperCase());
      }

      if (input.territoryId) {
        where.push("d.territory_id = ?");
        params.push(onlyDigits(input.territoryId));
      }

      if (input.dataInicial) {
        where.push("d.data >= ?");
        params.push(input.dataInicial);
      }

      if (input.dataFinal) {
        where.push("d.data <= ?");
        params.push(input.dataFinal);
      }

      const sql = `
        SELECT d.* FROM diarios_fts
        JOIN diarios d ON d.id = diarios_fts.rowid
        WHERE ${where.join(" AND ")}
        ORDER BY bm25(diarios_fts), d.data DESC
        LIMIT ?
      `;

      params.push(limite);

      const rows = db.query(sql).all(...(params as never[])) as DiarioRow[];

      return rows.map((r) => mapRow(r, input.termo));
    },
    catch: (cause): EvlogError =>
      queridoDiarioErrors.BUSCA({ internal: { cause: String(cause) } }),
  });
}

export type BuscarCnpjInput = {
  cnpj: string;
  uf?: string;
  dataInicial?: string;
  dataFinal?: string;
  limite?: number;
};

/**
 * Busca diarios que mencionam um CNPJ no corpo (editais/contratos).
 * Usa a tabela diario_cnpjs preenchida no indexer via regex sobre o texto.
 */
export function buscarCnpjEmDiario(
  db: Database,
  input: BuscarCnpjInput
): ResultType<DiarioHit[], QdServiceError> {
  return Result.gen(function* () {
    const cnpj = onlyDigits(input.cnpj);

    if (cnpj.length !== 14) {
      return yield* Result.err(
        queridoDiarioErrors.CNPJ_INVALIDO({ cnpj: input.cnpj })
      );
    }

    const hits = yield* Result.try({
      try: () => {
        const limite = clampLimit(input.limite);
        const where: string[] = ["c.cnpj = ?"];
        const params: unknown[] = [cnpj];

        if (input.uf) {
          where.push("d.uf = ?");
          params.push(input.uf.toUpperCase());
        }

        if (input.dataInicial) {
          where.push("d.data >= ?");
          params.push(input.dataInicial);
        }

        if (input.dataFinal) {
          where.push("d.data <= ?");
          params.push(input.dataFinal);
        }

        const sql = `
          SELECT d.* FROM diario_cnpjs c
          JOIN diarios d ON d.id = c.diario_id
          WHERE ${where.join(" AND ")}
          ORDER BY d.data DESC
          LIMIT ?
        `;

        params.push(limite);

        const rows = db.query(sql).all(...(params as never[])) as DiarioRow[];
        const mascara = formatCnpj(cnpj);

        return rows.map((r) => mapRow(r, mascara));
      },
      catch: (cause): EvlogError =>
        queridoDiarioErrors.BUSCA({ internal: { cause: String(cause) } }),
    });

    return Result.ok(hits);
  });
}

export type DiariosPorMunicipioInput = {
  territoryId: string;
  termo?: string;
  dataInicial?: string;
  dataFinal?: string;
  limite?: number;
};

/**
 * Lista diarios de um municipio (codigo IBGE / territory_id), opcionalmente
 * filtrando por palavra-chave e periodo. Quando ha termo, usa o FTS; senao,
 * apenas o indice por territory_id + data.
 */
export function diariosPorMunicipio(
  db: Database,
  input: DiariosPorMunicipioInput
): ResultType<DiarioHit[], QdServiceError> {
  return Result.try({
    try: () => {
      const territoryId = onlyDigits(input.territoryId);
      const limite = clampLimit(input.limite);

      if (input.termo && input.termo.trim()) {
        const where: string[] = [
          "diarios_fts MATCH ?",
          "d.territory_id = ?",
        ];
        const params: unknown[] = [toFtsMatch(input.termo), territoryId];

        if (input.dataInicial) {
          where.push("d.data >= ?");
          params.push(input.dataInicial);
        }

        if (input.dataFinal) {
          where.push("d.data <= ?");
          params.push(input.dataFinal);
        }

        const sql = `
          SELECT d.* FROM diarios_fts
          JOIN diarios d ON d.id = diarios_fts.rowid
          WHERE ${where.join(" AND ")}
          ORDER BY d.data DESC
          LIMIT ?
        `;

        params.push(limite);

        const rows = db.query(sql).all(...(params as never[])) as DiarioRow[];

        return rows.map((r) => mapRow(r, input.termo));
      }

      const where: string[] = ["territory_id = ?"];
      const params: unknown[] = [territoryId];

      if (input.dataInicial) {
        where.push("data >= ?");
        params.push(input.dataInicial);
      }

      if (input.dataFinal) {
        where.push("data <= ?");
        params.push(input.dataFinal);
      }

      const sql = `
        SELECT * FROM diarios
        WHERE ${where.join(" AND ")}
        ORDER BY data DESC
        LIMIT ?
      `;

      params.push(limite);

      const rows = db.query(sql).all(...(params as never[])) as DiarioRow[];

      return rows.map((r) => mapRow(r));
    },
    catch: (cause): EvlogError =>
      queridoDiarioErrors.BUSCA({ internal: { cause: String(cause) } }),
  });
}

function clampLimit(limite: number | undefined): number {
  if (!limite || limite < 1) return 10;

  return Math.min(limite, 50);
}

function formatCnpj(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
