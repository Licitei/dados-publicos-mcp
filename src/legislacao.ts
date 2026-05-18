import { findNorma, normas, normalize } from "./catalog";
import {
  getIndiceLocal,
  recriarIndiceLocal,
  statusIndiceLocal,
} from "./runtime-store";
import { getIndexPath } from "./store";

export type SearchInput = {
  termo: string;
  norma?: string;
  limite?: number;
};

export type ArtigoInput = {
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

export async function buscarLegislacao(input: SearchInput) {
  const indice = await requireIndex();
  const termo = normalize(input.termo);
  const limite = Math.min(input.limite ?? 8, 25);
  const normaFiltro = input.norma ? resolveNorma(input.norma).id : null;
  const resultados = [];

  for (const documento of indice.documentos) {
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

      if (resultados.length >= limite) return resultados;
    }
  }

  return resultados;
}

export async function obterArtigo(input: ArtigoInput) {
  const indice = await requireIndex();
  const norma = resolveNorma(input.norma);
  const documento = indice.documentos.find(
    (item) => item.norma.id === norma.id
  );

  if (!documento) {
    throw new Error(`Norma nao indexada: ${norma.id}`);
  }

  const artigo = String(input.artigo).replace(/^art\.?\s*/i, "");
  const pattern = new RegExp(`^Art\\.?\\s*${escapeRegExp(artigo)}[ºo°]?[\\s.]`, "i");
  const start = documento.paragrafos.findIndex((paragrafo) =>
    pattern.test(paragrafo)
  );

  if (start === -1) {
    return {
      norma: norma.id,
      titulo: norma.titulo,
      artigo,
      encontrado: false,
      url: norma.url,
    };
  }

  const trechos = [];

  for (const paragrafo of documento.paragrafos.slice(start)) {
    if (trechos.length > 0 && /^Art\.?\s*\d+[ºo°]?[\s.]/i.test(paragrafo)) {
      break;
    }

    trechos.push(paragrafo);
  }

  return {
    norma: norma.id,
    titulo: norma.titulo,
    artigo,
    encontrado: true,
    texto: trechos.join("\n"),
    url: norma.url,
  };
}

function resolveNorma(id: string) {
  const norma = findNorma(id);

  if (!norma) {
    throw new Error(`Norma nao encontrada: ${id}`);
  }

  return norma;
}

async function requireIndex() {
  const indice = await getIndiceLocal();

  if (!indice) {
    throw new Error(
      `Indice local nao encontrado. Rode "bun run index" ou chame a ferramenta indexar_legislacao. Caminho esperado: ${getIndexPath()}`
    );
  }

  return indice;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
