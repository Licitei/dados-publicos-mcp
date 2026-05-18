import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Norma } from "./catalog";

export type DocumentoIndexado = {
  norma: Norma;
  paragrafos: string[];
};

export type IndiceLegislacao = {
  versao: 1;
  criadoEm: string;
  fonte: "planalto";
  documentos: DocumentoIndexado[];
};

export function getDataDir() {
  if (Bun.env.DADOS_PUBLICOS_MCP_DATA_DIR) {
    return Bun.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  }

  if (Bun.env.XDG_DATA_HOME) {
    return join(Bun.env.XDG_DATA_HOME, "dados-publicos-mcp");
  }

  const home = Bun.env.HOME;

  if (!home) {
    throw new Error("HOME nao definido; configure DADOS_PUBLICOS_MCP_DATA_DIR");
  }

  return join(home, ".local", "share", "dados-publicos-mcp");
}

export function getIndexPath() {
  return join(getDataDir(), "index.json");
}

export async function loadIndex() {
  const path = getIndexPath();
  const file = Bun.file(path);

  if (!(await file.exists())) return null;

  return (await file.json()) as IndiceLegislacao;
}

export async function saveIndex(indice: IndiceLegislacao) {
  const path = getIndexPath();

  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(indice, null, 2)}\n`);

  return path;
}
