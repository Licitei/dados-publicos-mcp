import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { findNorma, normalize, normas } from "./catalog";
import { legislacaoErrors } from "./errors";
import {
  abrirLeitura,
  indiceExiste,
  recriarIndiceLocal,
  statusIndiceLocal,
} from "./store";

const metaPorId = new Map(normas.map((norma) => [norma.id, norma]));

// ---- Schemas validados das saidas ----

export const trechoSchema = z
  .object({
    norma: z.string(),
    titulo: z.string(),
    trecho: z.string(),
    indice: z.number().int().nonnegative(),
    url: z.string(),
  })
  .strict();
export type Trecho = z.infer<typeof trechoSchema>;
const buscaResultadoSchema = z.array(trechoSchema);

export const artigoSchema = z
  .object({
    norma: z.string(),
    titulo: z.string(),
    artigo: z.string(),
    encontrado: z.boolean(),
    texto: z.string().nullable(),
    url: z.string(),
  })
  .strict();
export type Artigo = z.infer<typeof artigoSchema>;

type SearchInput = { termo: string; norma?: string; limite?: number };
type ArtigoInput = { norma: string; artigo: string | number };

export function listarNormas() {
  return normas.map((norma) => ({
    id: norma.id,
    titulo: norma.titulo,
    url: norma.url,
    temas: norma.temas,
    apelidos: norma.apelidos,
  }));
}

export async function statusIndice() {
  return statusIndiceLocal();
}

export async function recriarIndice() {
  return recriarIndiceLocal();
}

export async function buscarLegislacao(
  input: SearchInput
): Promise<ResultType<Trecho[], EvlogError>> {
  return Result.gen(function* () {
    if (!indiceExiste()) {
      return yield* Result.err(legislacaoErrors.INDICE_AUSENTE());
    }

    let normaId: string | null = null;

    if (input.norma) {
      const norma = findNorma(input.norma);

      if (!norma) {
        return yield* Result.err(
          legislacaoErrors.NORMA_NAO_ENCONTRADA({ norma: input.norma })
        );
      }

      normaId = norma.id;
    }

    const trechos = yield* consultarFts(
      normalize(input.termo),
      normaId,
      clampLimite(input.limite)
    );

    return Result.ok(trechos);
  });
}

export async function obterArtigo(
  input: ArtigoInput
): Promise<ResultType<Artigo, EvlogError>> {
  return Result.gen(function* () {
    const norma = findNorma(input.norma);

    if (!norma) {
      return yield* Result.err(
        legislacaoErrors.NORMA_NAO_ENCONTRADA({ norma: input.norma })
      );
    }

    if (!indiceExiste()) {
      return yield* Result.err(legislacaoErrors.INDICE_AUSENTE());
    }

    const paragrafos = yield* lerParagrafos(norma.id);

    if (paragrafos.length === 0) {
      return yield* Result.err(
        legislacaoErrors.NORMA_NAO_INDEXADA({ norma: norma.id })
      );
    }

    const artigo = String(input.artigo).replace(/^art\.?\s*/i, "");
    const start = findArticleStart(paragrafos, artigo);

    if (start === -1) {
      return Result.ok(
        artigoSchema.parse({
          norma: norma.id,
          titulo: norma.titulo,
          artigo,
          encontrado: false,
          texto: null,
          url: norma.url,
        })
      );
    }

    const trechos: string[] = [];

    for (let index = start; index < paragrafos.length; index++) {
      if (index > start && isArticleStart(paragrafos, index)) break;

      trechos.push(paragrafos[index] ?? "");
    }

    return Result.ok(
      artigoSchema.parse({
        norma: norma.id,
        titulo: norma.titulo,
        artigo,
        encontrado: true,
        texto: trechos.join("\n"),
        url: norma.url,
      })
    );
  });
}

type RowBusca = { norma: string; indice: number; trecho: string };

function consultarFts(
  termoNorm: string,
  normaId: string | null,
  limite: number
): ResultType<Trecho[], EvlogError> {
  const fts = toFtsQuery(termoNorm);

  if (!fts) return Result.ok([]);

  return Result.try({
    try: () => {
      const db = abrirLeitura();

      try {
        const params: SQLQueryBindings[] = [fts];
        let sql =
          "SELECT p.norma_id AS norma, p.idx AS indice, p.texto AS trecho " +
          "FROM paragrafo_fts JOIN paragrafo p ON p.id = paragrafo_fts.rowid " +
          "WHERE paragrafo_fts MATCH ?";

        if (normaId) {
          sql += " AND p.norma_id = ?";
          params.push(normaId);
        }

        sql += " ORDER BY bm25(paragrafo_fts) LIMIT ?";
        params.push(limite);

        const rows = db.query(sql).all(...params) as RowBusca[];

        return buscaResultadoSchema.parse(rows.map(toTrecho));
      } finally {
        db.close();
      }
    },
    catch: (cause): EvlogError =>
      legislacaoErrors.BUSCA({ internal: { cause: String(cause) } }),
  });
}

function lerParagrafos(normaId: string): ResultType<string[], EvlogError> {
  return Result.try({
    try: () => {
      const db = abrirLeitura();

      try {
        const rows = db
          .query("SELECT texto FROM paragrafo WHERE norma_id = ? ORDER BY idx")
          .all(normaId) as { texto: string }[];

        return rows.map((row) => row.texto);
      } finally {
        db.close();
      }
    },
    catch: (cause): EvlogError =>
      legislacaoErrors.BUSCA({ internal: { cause: String(cause) } }),
  });
}

function toTrecho(row: RowBusca): Trecho {
  const norma = metaPorId.get(row.norma);

  return {
    norma: row.norma,
    titulo: norma?.titulo ?? row.norma,
    trecho: row.trecho,
    indice: row.indice,
    url: norma?.url ?? "",
  };
}

/** Converte um termo normalizado em query FTS5 segura (cada palavra como prefixo). */
function toFtsQuery(termoNorm: string): string {
  const tokens = termoNorm
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((token) => token.length >= 2);

  if (tokens.length === 0) return "";

  return tokens.map((token) => `"${token}"*`).join(" ");
}

function clampLimite(limite?: number): number {
  if (limite === undefined || !Number.isFinite(limite) || limite <= 0) return 8;

  return Math.min(Math.floor(limite), 25);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArticleStart(paragrafos: string[], artigo: string): number {
  return paragrafos.findIndex((_, index) =>
    isArticleStart(paragrafos, index, artigo)
  );
}

function isArticleStart(
  paragrafos: string[],
  index: number,
  artigo?: string
): boolean {
  const current = paragrafos[index]?.trim() ?? "";
  const next = paragrafos[index + 1]?.trim() ?? "";

  if (!/^Art\.?$/i.test(current) && !/^Art\.?\s+/i.test(current)) {
    return false;
  }

  const inlineNumber = current.replace(/^Art\.?\s*/i, "");

  if (startsWithArticleNumber(inlineNumber, artigo)) return true;

  return startsWithArticleNumber(next, artigo);
}

function startsWithArticleNumber(value: string, artigo?: string): boolean {
  if (!value) return false;

  const number = artigo ? escapeRegExp(artigo) : "\\d+";

  return new RegExp(`^${number}[ºo°]?[\\s.]`, "i").test(value);
}
