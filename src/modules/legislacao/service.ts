import { Result, TaggedError, type Result as ResultType } from "better-result";
import { findNorma, normas, normalize } from "./catalog";
import {
  getIndiceLocal,
  recriarIndiceLocal,
  statusIndiceLocal,
  type StoreError,
} from "./store";
import { getIndexPath, type IndiceLegislacao } from "./store";

class IndexNotFoundError extends TaggedError("IndexNotFoundError")<{
  message: string;
  path: string;
}>() {}

class NormaNotFoundError extends TaggedError("NormaNotFoundError")<{
  message: string;
  norma: string;
}>() {}

class NormaNotIndexedError extends TaggedError("NormaNotIndexedError")<{
  message: string;
  norma: string;
}>() {}

type LegislacaoError =
  | StoreError
  | IndexNotFoundError
  | NormaNotFoundError
  | NormaNotIndexedError;

type SearchInput = {
  termo: string;
  norma?: string;
  limite?: number;
};

type ArtigoInput = {
  norma: string;
  artigo: string | number;
};

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
): Promise<
  ResultType<
    {
      norma: string;
      titulo: string;
      trecho: string;
      indice: number;
      url: string;
    }[],
    LegislacaoError
  >
> {
  const indice = await requireIndex();

  if (Result.isError(indice)) return indice;

  const termo = normalize(input.termo);
  const limite = Math.min(input.limite ?? 8, 25);
  const norma = input.norma ? resolveNorma(input.norma) : null;

  if (norma && Result.isError(norma)) return norma;

  const normaFiltro = norma?.value.id ?? null;
  const resultados = [];

  for (const documento of indice.value.documentos) {
    if (normaFiltro && documento.norma.id !== normaFiltro) continue;

    for (const [index, paragrafo] of documento.paragrafos.entries()) {
      if (!normalize(paragrafo).includes(termo)) continue;

      resultados.push({
        norma: documento.norma.id,
        titulo: documento.norma.titulo,
        trecho: paragrafo,
        indice: index,
        url: documento.norma.url,
      });

      if (resultados.length >= limite) return Result.ok(resultados);
    }
  }

  return Result.ok(resultados);
}

export async function obterArtigo(input: ArtigoInput) {
  const indice = await requireIndex();

  if (Result.isError(indice)) return indice;

  const norma = resolveNorma(input.norma);

  if (Result.isError(norma)) return norma;

  const documento = indice.value.documentos.find(
    (item) => item.norma.id === norma.value.id
  );

  if (!documento) {
    return Result.err(
      new NormaNotIndexedError({
        message: `Norma nao indexada: ${norma.value.id}`,
        norma: norma.value.id,
      })
    );
  }

  const artigo = String(input.artigo).replace(/^art\.?\s*/i, "");
  const start = findArticleStart(documento.paragrafos, artigo);

  if (start === -1) {
    return Result.ok({
      norma: norma.value.id,
      titulo: norma.value.titulo,
      artigo,
      encontrado: false,
      url: norma.value.url,
    });
  }

  const trechos = [];

  for (let index = start; index < documento.paragrafos.length; index++) {
    if (index > start && isArticleStart(documento.paragrafos, index)) {
      break;
    }

    trechos.push(documento.paragrafos[index]);
  }

  return Result.ok({
    norma: norma.value.id,
    titulo: norma.value.titulo,
    artigo,
    encontrado: true,
    texto: trechos.join("\n"),
    url: norma.value.url,
  });
}

function resolveNorma(id: string): ResultType<
  (typeof normas)[number],
  NormaNotFoundError
> {
  const norma = findNorma(id);

  if (!norma) {
    return Result.err(
      new NormaNotFoundError({
        message: `Norma nao encontrada: ${id}`,
        norma: id,
      })
    );
  }

  return Result.ok(norma);
}

async function requireIndex(): Promise<ResultType<IndiceLegislacao, LegislacaoError>> {
  const indice = await getIndiceLocal();

  if (Result.isError(indice)) return indice;

  if (!indice.value) {
    return Result.err(
      new IndexNotFoundError({
        message: `Indice local nao encontrado. Rode "bun run index" ou chame a ferramenta indexar_legislacao. Caminho esperado: ${getIndexPath()}`,
        path: getIndexPath(),
      })
    );
  }

  return Result.ok(indice.value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArticleStart(paragrafos: string[], artigo: string) {
  return paragrafos.findIndex((_, index) =>
    isArticleStart(paragrafos, index, artigo)
  );
}

function isArticleStart(paragrafos: string[], index: number, artigo?: string) {
  const current = paragrafos[index]?.trim() ?? "";
  const next = paragrafos[index + 1]?.trim() ?? "";

  if (!/^Art\.?$/i.test(current) && !/^Art\.?\s+/i.test(current)) {
    return false;
  }

  const inlineNumber = current.replace(/^Art\.?\s*/i, "");

  if (startsWithArticleNumber(inlineNumber, artigo)) return true;

  return startsWithArticleNumber(next, artigo);
}

function startsWithArticleNumber(value: string, artigo?: string) {
  if (!value) return false;

  const number = artigo ? escapeRegExp(artigo) : "\\d+";

  return new RegExp(`^${number}[ºo°]?[\\s.]`, "i").test(value);
}
