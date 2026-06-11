import { join } from "node:path";
import { panic } from "better-result";

/**
 * Diretorio base de dados do MCP.
 * Usa DADOS_PUBLICOS_MCP_DATA_DIR quando definido; caso contrario,
 * ~/.local/share/dados-publicos-mcp. Lanca erro claro se HOME ausente.
 */
export function getDataDir(): string {
  const configured = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;

  if (configured) return configured;

  const home = process.env.HOME;

  if (!home) {
    panic("HOME nao definido; configure DADOS_PUBLICOS_MCP_DATA_DIR");
  }

  return join(home, ".local", "share", "dados-publicos-mcp");
}

/** Diretorio de um dominio: getDataDir()/<dominio>. */
export function dominioDir(dominio: string): string {
  return join(getDataDir(), dominio);
}

/** Caminho de um arquivo dentro do dominio: getDataDir()/<dominio>/<file>. */
export function dominioPath(dominio: string, file: string): string {
  return join(dominioDir(dominio), file);
}
